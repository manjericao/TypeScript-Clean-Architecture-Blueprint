import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import status from 'http-status';

import { ILogger } from '@application/contracts/infrastructure';
import { DTOValidationError } from '@enterprise/dto/errors';
import { HttpResponse, ResponseObject } from '@interface/http/adapters/Http';
import { ErrorResponse, SuccessResponse } from '@interface/http/adapters/Response';
import { BaseController } from '@interface/http/controllers/base';
import { ValidationError } from 'class-validator';

// --- Mocks ---

const mockJson = jest.fn();
// Create the mock for the ResponseObject that status returns
const mockResponseObject: jest.Mocked<ResponseObject> = {
  json: mockJson,
};
// Create the mock for the status function, ensuring it returns the mock ResponseObject
const mockStatus = jest.fn<(code: number) => ResponseObject>().mockReturnValue(mockResponseObject);

// Define the main mockResponse, satisfying HttpResponse and including other necessary mocks
const mockResponse: jest.Mocked<HttpResponse> & {
  // Include other methods if tests directly use them on mockResponse,
  // acknowledging they aren't part of the strict HttpResponse interface.
  json: jest.Mock;
  send: jest.Mock;
  setHeader: jest.Mock;
  redirect: jest.Mock;
} = {
  status: mockStatus,
  // Keep the other top-level mocks if your tests rely on them directly on mockResponse
  json: jest.fn(), // Note: This might be confusing alongside status(...).json()
  send: jest.fn(),
  setHeader: jest.fn(),
  redirect: jest.fn(),
};

// Mock ILogger
const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// --- Test Controller ---

// Concrete implementation for testing the abstract BaseController
class TestController extends BaseController {
  // Expose protected methods for testing if needed, or test through public methods
  // For this test; we'll call the protected methods directly on an instance.
}

// --- Test Suite ---

describe('BaseController', () => {
  let testController: TestController;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    testController = new TestController();
  });

  // --- Test Cases ---

  describe('executeSafely', () => {
    it('should execute logic successfully without errors', async () => {
      // Explicitly type the mock function to match the expected signature
      const logic = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

      await (testController as any).executeSafely(mockResponse, logic, mockLogger);

      expect(logic).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
      // Use the specific mocks: mockStatus and mockJson
      expect(mockStatus).not.toHaveBeenCalled();
      expect(mockJson).not.toHaveBeenCalled();
      // Ensure the top-level mockResponse.json wasn't called either
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should handle DTOValidationError and call handleValidationError', async () => {
      // 1. Define mock ValidationError objects in an array
      const mockRawValidationErrors: ValidationError[] = [
        {
          property: 'field',
          constraints: { someRule: 'Error message' },
          // Add other required properties of ValidationError if necessary (e.g., value, target, children)
          // Using fake values here if they are not strictly needed for the test logic
          value: undefined,
          target: {},
          children: [],
        },
      ];

      // 2. Create the error using the array
      const dtoError = new DTOValidationError(mockRawValidationErrors);

      // 3. Define the expected formatted errors (output of getFormattedErrors)
      const expectedFormattedErrors = { field: ['Error message'] };

      // Add the explicit type argument here
      const logic = jest.fn<() => Promise<void>>().mockRejectedValue(dtoError);
      const handleValidationErrorSpy = jest.spyOn(testController as any, 'handleValidationError');

      await (testController as any).executeSafely(mockResponse, logic, mockLogger);

      expect(logic).toHaveBeenCalledTimes(1);
      expect(handleValidationErrorSpy).toHaveBeenCalledTimes(1);
      // 4. Assert handleValidationError was called with the *formatted* errors
      expect(handleValidationErrorSpy).toHaveBeenCalledWith(mockResponse, expectedFormattedErrors);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle generic Error, log it, and call handleError', async () => {
      const genericError = new Error('Something went wrong');
      // Add the explicit type argument here
      const logic = jest.fn<() => Promise<void>>().mockRejectedValue(genericError);
      const handleErrorSpy = jest.spyOn(testController as any, 'handleError');

      await (testController as any).executeSafely(mockResponse, logic, mockLogger);

      expect(logic).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('Unexpected error during request execution', { error: genericError });
      expect(handleErrorSpy).toHaveBeenCalledTimes(1);
      // Check if handleError was called correctly (it returns a function, so we check the inner call)
      // Verify the status was called BEFORE json
      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({ // Check the json mock attached to the status mock
        type: 'InternalServerError',
        details: genericError,
        message: genericError.message,
      });
      // Ensure the top-level mockResponse.json wasn't called directly
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions, log them, and call handleError', async () => {
      const nonError = { message: 'Just an object', code: 500 };
      // Add the explicit type argument here
      const logic = jest.fn<() => Promise<void>>().mockRejectedValue(nonError);
      const handleErrorSpy = jest.spyOn(testController as any, 'handleError');

      await (testController as any).executeSafely(mockResponse, logic, mockLogger);

      expect(logic).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('Unexpected error during request execution', { error: nonError });
      expect(handleErrorSpy).toHaveBeenCalledTimes(1);
      // Check the specific mocks for status and json
      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        type: 'InternalServerError',
        details: nonError,
        message: 'An unexpected error occurred', // Default message for non-Errors
      });
      // Ensure the top-level mockResponse.json wasn't called directly
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  describe('handleSuccess', () => {
    it('should send success response with default status OK', () => {
      const data = { id: 1, name: 'Test' };
      const expectedResponse: SuccessResponse<typeof data> = { data };

      (testController as any).handleSuccess(mockResponse, data);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should send success response with specified status code', () => {
      const data = { message: 'Created' };
      const statusCode = status.CREATED;
      const expectedResponse: SuccessResponse<typeof data> = { data };

      (testController as any).handleSuccess(mockResponse, data, statusCode);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(statusCode);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should send success response with metadata', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const meta = { page: 1, limit: 10, total: 20 };
      const expectedResponse: SuccessResponse<typeof data> = { data, meta };

      (testController as any).handleSuccess(mockResponse, data, status.OK, meta);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  describe('handleError', () => {
    it('should return a function that sends an error response with default status 500', () => {
      const error = new Error('Internal issue');
      const expectedResponse: ErrorResponse = {
        type: 'InternalServerError',
        details: error,
        message: error.message,
      };

      const errorHandler = (testController as any).handleError(mockResponse);
      errorHandler(error); // Execute the returned function

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should return a function that sends an error response with specified status code', () => {
      const error = { customError: 'detail' }; // Non-Error object
      const statusCode = status.BAD_GATEWAY;
      const expectedResponse: ErrorResponse = {
        type: 'InternalServerError', // Type remains based on the handler, not the code maybe? Let's stick to the impl.
        details: error,
        message: 'An unexpected error occurred', // Default for non-Errors
      };

      const errorHandler = (testController as any).handleError(mockResponse, statusCode);
      errorHandler(error);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(statusCode);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  describe('handleNotFound', () => {
    it('should send a 404 response with default message', () => {
      const expectedResponse: ErrorResponse = {
        type: 'NotFoundError',
        details: null,
        message: 'Resource not found',
      };

      (testController as any).handleNotFound(mockResponse);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should send a 404 response with a custom message', () => {
      const customMessage = 'User with ID 123 not found';
      const expectedResponse: ErrorResponse = {
        type: 'NotFoundError',
        details: null,
        message: customMessage,
      };

      (testController as any).handleNotFound(mockResponse, customMessage);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  describe('handleValidationError', () => {
    it('should send a 400 response with validation details', () => {
      const details = { email: ['Invalid email format'], password: ['Too short'] };
      const expectedResponse: ErrorResponse = {
        type: 'ValidationError',
        details: details,
        message: 'Validation failed',
      };

      (testController as any).handleValidationError(mockResponse, details);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  describe('handleConflict', () => {
    it('should send a 409 response with default message', () => {
      const expectedResponse: ErrorResponse = {
        type: 'ConflictError',
        details: null,
        message: 'Resource already exists',
      };

      (testController as any).handleConflict(mockResponse);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(status.CONFLICT);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should send a 409 response with a custom message', () => {
      const customMessage = 'Username "tester" is already taken.';
      const expectedResponse: ErrorResponse = {
        type: 'ConflictError',
        details: null,
        message: customMessage,
      };

      // Reset mocks if they are not reset automatically between tests in your setup
      // mockStatus.mockClear();
      // mockJson.mockClear();
      // mockResponse.json.mockClear(); // Clear the original mock too

      (testController as any).handleConflict(mockResponse, customMessage);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1); // Should be 1 for this specific test
      expect(mockStatus).toHaveBeenCalledWith(status.CONFLICT);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1); // Should be 1 for this specific test
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  describe('handleUnauthorized', () => {
    it('should send a 401 response with the specified message', () => {
      const message = 'Invalid credentials provided.';
      const expectedResponse: ErrorResponse = {
        type: 'UnauthorizedError',
        details: null,
        message: message,
      };

      (testController as any).handleUnauthorized(mockResponse, message);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(status.UNAUTHORIZED);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  describe('handleForbidden', () => {
    it('should send a 403 response with the specified message', () => {
      const message = 'Admin privileges required.';
      const expectedResponse: ErrorResponse = {
        type: 'ForbiddenError',
        details: null,
        message: message,
      };

      (testController as any).handleForbidden(mockResponse, message);

      // Check that mockResponse.status (which is mockStatus) was called
      expect(mockStatus).toHaveBeenCalledTimes(1);
      expect(mockStatus).toHaveBeenCalledWith(status.FORBIDDEN);

      // Check that mockJson (the one returned by status) was called
      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalledWith(expectedResponse);

      // Ensure the top-level mockResponse.json was NOT called
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });
});
