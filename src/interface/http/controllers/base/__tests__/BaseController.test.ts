import { status } from 'http-status';
import { BaseController } from '../BaseController';
import { HttpResponse } from '@interface/http/types/Http';
import { ErrorResponse, SuccessResponse } from '@interface/http/types/Response';

// Creating a concrete implementation of the abstract class for testing
class TestController extends BaseController {}

describe('BaseController', () => {
  let testController: TestController;
  let mockResponse: Partial<HttpResponse>;
  let mockStatusFn: jest.Mock;
  let mockJsonFn: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    mockJsonFn = jest.fn();
    mockStatusFn = jest.fn().mockReturnValue({ json: mockJsonFn });
    mockResponse = { status: mockStatusFn };

    testController = new TestController();
  });

  describe('handleSuccess', () => {
    it('should handle success response with default status code', () => {
      const data = { message: 'Success!' };

      // Using reflection to access the protected method
      (testController as any).handleSuccess(mockResponse as HttpResponse, data);

      const expectedResponse: SuccessResponse<typeof data> = {
        data
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle success response with custom status code', () => {
      const data = { message: 'Created!' };
      const customStatus = status.CREATED;

      (testController as any).handleSuccess(mockResponse as HttpResponse, data, customStatus);

      const expectedResponse: SuccessResponse<typeof data> = {
        data
      };

      expect(mockStatusFn).toHaveBeenCalledWith(customStatus);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle success response with pagination metadata', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const meta = {
        page: 1,
        limit: 10,
        total: 20
      };

      (testController as any).handleSuccess(mockResponse as HttpResponse, data, status.OK, meta);

      const expectedResponse: SuccessResponse<typeof data> = {
        data,
        meta
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle success response with partial pagination metadata', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const meta = {
        page: 1,
        // Only providing part of the metadata
      };

      (testController as any).handleSuccess(mockResponse as HttpResponse, data, status.OK, meta);

      const expectedResponse: SuccessResponse<typeof data> = {
        data,
        meta
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle success response with empty metadata', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const meta = {};

      (testController as any).handleSuccess(mockResponse as HttpResponse, data, status.OK, meta);

      const expectedResponse: SuccessResponse<typeof data> = {
        data,
        meta
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle empty data', () => {
      const data = null;

      (testController as any).handleSuccess(mockResponse as HttpResponse, data);

      const expectedResponse: SuccessResponse<null> = {
        data
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });
  });

  describe('handleError', () => {
    it('should handle errors with default status code', () => {
      const errorHandler = (testController as any).handleError(mockResponse as HttpResponse);
      const error = new Error('Test error');

      errorHandler(error);

      const expectedResponse: ErrorResponse = {
        type: 'InternalServerError',
        details: error,
        message: 'Test error'
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle errors with custom status code', () => {
      const customStatus = status.BAD_GATEWAY;
      const errorHandler = (testController as any).handleError(mockResponse as HttpResponse, customStatus);
      const error = new Error('Gateway error');

      errorHandler(error);

      const expectedResponse: ErrorResponse = {
        type: 'InternalServerError',
        details: error,
        message: 'Gateway error'
      };

      expect(mockStatusFn).toHaveBeenCalledWith(customStatus);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle non-Error objects', () => {
      const errorHandler = (testController as any).handleError(mockResponse as HttpResponse);
      const error = { code: 500, reason: 'Something went wrong' };

      errorHandler(error);

      const expectedResponse: ErrorResponse = {
        type: 'InternalServerError',
        details: error,
        message: 'An unexpected error occurred'
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle string errors', () => {
      const errorHandler = (testController as any).handleError(mockResponse as HttpResponse);
      const error = 'Something went wrong';

      errorHandler(error);

      const expectedResponse: ErrorResponse = {
        type: 'InternalServerError',
        details: error,
        message: 'An unexpected error occurred'
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle null/undefined errors', () => {
      const errorHandler = (testController as any).handleError(mockResponse as HttpResponse);

      errorHandler(null);

      const expectedResponse: ErrorResponse = {
        type: 'InternalServerError',
        details: null,
        message: 'An unexpected error occurred'
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });
  });

  describe('handleNotFound', () => {
    it('should handle not found with default message', () => {
      (testController as any).handleNotFound(mockResponse as HttpResponse);

      const expectedResponse: ErrorResponse = {
        type: 'NotFoundError',
        details: null,
        message: 'Resource not found'
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle not found with custom message', () => {
      const customMessage = 'User not found';

      (testController as any).handleNotFound(mockResponse as HttpResponse, customMessage);

      const expectedResponse: ErrorResponse = {
        type: 'NotFoundError',
        details: null,
        message: customMessage
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });
  });

  describe('handleValidationError', () => {
    it('should handle validation error with simple string detail', () => {
      const details = 'Email is required';

      (testController as any).handleValidationError(mockResponse as HttpResponse, details);

      const expectedResponse: ErrorResponse = {
        type: 'ValidationError',
        details,
        message: 'Validation failed'
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle validation error with complex object details', () => {
      const details = {
        email: ['Email is required', 'Email format is invalid'],
        password: ['Password is too short']
      };

      (testController as any).handleValidationError(mockResponse as HttpResponse, details);

      const expectedResponse: ErrorResponse = {
        type: 'ValidationError',
        details,
        message: 'Validation failed'
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle validation error with null details', () => {
      (testController as any).handleValidationError(mockResponse as HttpResponse, null);

      const expectedResponse: ErrorResponse = {
        type: 'ValidationError',
        details: null,
        message: 'Validation failed'
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });
  });
  describe('handleUnauthorized', () => {
    it('should set status to UNAUTHORIZED and respond with an error message', () => {
      const errorMessage = 'Invalid credentials';

      // Access the protected method via type casting
      (testController as any).handleUnauthorized(mockResponse as HttpResponse, errorMessage);

      const expectedResponse = {
        type: 'UnauthorizedError',
        message: errorMessage
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.UNAUTHORIZED);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle empty error message', () => {
      const errorMessage = '';

      // Access the protected method via type casting
      (testController as any).handleUnauthorized(mockResponse as HttpResponse, errorMessage);

      const expectedResponse = {
        type: 'UnauthorizedError',
        message: errorMessage
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.UNAUTHORIZED);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });
  });

  describe('handleForbidden', () => {
    it('should set status to FORBIDDEN and respond with an error message', () => {
      const errorMessage = 'Access denied';

      // Access the protected method via type casting
      (testController as any).handleForbidden(mockResponse as HttpResponse, errorMessage);

      const expectedResponse = {
        type: 'ForbiddenError',
        message: errorMessage
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.FORBIDDEN);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle complex error message', () => {
      const errorMessage = 'You need to verify your email before accessing this resource';

      // Access the protected method via type casting
      (testController as any).handleForbidden(mockResponse as HttpResponse, errorMessage);

      const expectedResponse = {
        type: 'ForbiddenError',
        message: errorMessage
      };

      expect(mockStatusFn).toHaveBeenCalledWith(status.FORBIDDEN);
      expect(mockJsonFn).toHaveBeenCalledWith(expectedResponse);
    });
  });
});
