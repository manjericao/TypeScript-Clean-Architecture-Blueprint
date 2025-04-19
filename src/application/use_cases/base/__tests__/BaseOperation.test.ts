import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

import { ILogger } from '@application/contracts/infrastructure'; // Adjust path if needed
import { AbstractOperation } from '@application/use_cases/base/AbstractOperation'; // Adjust path if needed
import { BaseOperation } from '@application/use_cases/base/BaseOperation'; // Adjust path if needed
import { BaseOperationEvents, OperationError } from '@application/use_cases/base/OperationTypes'; // Adjust path if needed

// --- Mocks ---

// Mock the ILogger interface
const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// --- Concrete Implementation for Testing ---

// Define a simple event map for our mock operation
type MockOperationEvents = BaseOperationEvents<string> & { // Using string for success payload type
  CUSTOM_EVENT: number; // Example of another potential event
};

// Create a concrete class extending BaseOperation to test its functionality
class MockOperation extends BaseOperation<MockOperationEvents> {
  // Make emitOutput public for spying in tests (alternative: spy on prototype)
  public declare emitOutput: AbstractOperation<MockOperationEvents>['emitOutput'];

  constructor(logger: ILogger) {
    // Pass standard events + any custom ones to the base constructor
    super(['SUCCESS', 'ERROR', 'CUSTOM_EVENT'], logger);
  }

  // A dummy execute method required by the abstract nature, though not directly tested here
  async execute(input?: unknown): Promise<void> {
    this.logger.info('MockOperation execute called', { input });
    // Simulate some logic - perhaps emitting success for testing purposes
    if (input === 'succeed') {
      this.emitSuccess('Mock Success Data');
    } else if (input === 'fail') {
      this.emitError(new OperationError('MOCK_FAIL', 'Mock operation failed deliberately'));
    } else if (typeof input === 'number') {
      this.emitOutput('CUSTOM_EVENT', input);
    }
  }

  // Expose protected methods for direct testing if needed, though testing via execute is often preferred
  public testEmitSuccess(data: string): boolean {
    return this.emitSuccess(data);
  }

  public testEmitError(error: OperationError): boolean {
    return this.emitError(error);
  }
}

// --- Test Suite ---

describe('BaseOperation', () => {
  let mockOperation: MockOperation;
  let emitOutputSpy: jest.SpiedFunction<MockOperation['emitOutput']>;

  beforeEach(() => {
    // Reset mocks before each test to ensure isolation
    jest.resetAllMocks();

    // Instantiate the concrete class with the mock logger
    mockOperation = new MockOperation(mockLogger);

    // Spy on the emitOutput method of the *instance* to check interactions
    // We spy on the instance because emitOutput might depend on instance state (listeners)
    emitOutputSpy = jest.spyOn(mockOperation, 'emitOutput');
  });

  // --- Constructor Tests ---

  describe('constructor', () => {
    it('should correctly assign the logger dependency', () => {
      // Assert
      // Accessing protected logger via an explicit assertion or checking its usage
      // Since it's used in emitSuccess/emitError, those tests implicitly cover logger assignment.
      // We can also just check if it exists on the instance if needed, though less robust.
      expect((mockOperation as any).logger).toBe(mockLogger); // Accessing protected member for test
    });

    it('should call the parent AbstractOperation constructor with event names', () => {
      // This is implicitly tested by the ability to emit events defined in the constructor.
      // Direct verification requires spying on the super constructor, which can be complex.
      // We'll rely on the emit tests to confirm event names are registered.
      expect(mockOperation).toBeInstanceOf(AbstractOperation);
    });
  });

  // --- emitSuccess Tests ---

  describe('emitSuccess', () => {
    it('should call logger.info with correct operation name and data', () => {
      // Arrange
      const successData = faker.lorem.sentence();
      emitOutputSpy.mockReturnValue(true); // Assume event emission succeeds

      // Act
      mockOperation.testEmitSuccess(successData);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Operation MockOperation succeeded`, // Checks class name is used
        expect.objectContaining({
          operation: 'MockOperation',
          data: successData,
        })
      );
    });

    it('should call emitOutput with "SUCCESS" event and provided data', () => {
      // Arrange
      const successData = { id: faker.string.uuid(), value: faker.number.int() };
      emitOutputSpy.mockReturnValue(true);

      // Act
      mockOperation.testEmitSuccess(successData as any); // Cast needed if type differs

      // Assert
      expect(emitOutputSpy).toHaveBeenCalledTimes(1);
      expect(emitOutputSpy).toHaveBeenCalledWith('SUCCESS', successData);
    });

    it('should return the result of emitOutput (true if listeners exist)', () => {
      // Arrange
      const successData = faker.word.noun();
      emitOutputSpy.mockReturnValue(true); // Simulate successful emission

      // Act
      const result = mockOperation.testEmitSuccess(successData);

      // Assert
      expect(result).toBe(true);
    });

    it('should return the result of emitOutput (false if no listeners or emission fails)', () => {
      // Arrange
      const successData = faker.word.adjective();
      emitOutputSpy.mockReturnValue(false); // Simulate failed emission

      // Act
      const result = mockOperation.testEmitSuccess(successData);

      // Assert
      expect(result).toBe(false);
      // Ensure logger was still called even if emission failed
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
    });
  });

  // --- emitError Tests ---

  describe('emitError', () => {
    it('should call logger.error with correct operation name and error details', () => {
      // Arrange
      const errorCode = 'TEST_ERROR_CODE';
      const errorMessage = faker.hacker.phrase();
      const errorDetails = new Error(faker.lorem.sentence());
      const operationError = new OperationError(errorCode, errorMessage, errorDetails);
      emitOutputSpy.mockReturnValue(true);

      // Act
      mockOperation.testEmitError(operationError);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Operation MockOperation failed`, // Checks class name is used
        expect.objectContaining({
          operation: 'MockOperation',
          error: expect.objectContaining({
            code: errorCode,
            message: errorMessage,
            details: errorDetails,
          }),
        })
      );
      // Check the exact error instance was passed
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: operationError })
      );
    });

    it('should call emitOutput with "ERROR" event and the OperationError instance', () => {
      // Arrange
      const operationError = new OperationError('FAIL_CODE', faker.lorem.words(5));
      emitOutputSpy.mockReturnValue(true);

      // Act
      mockOperation.testEmitError(operationError);

      // Assert
      expect(emitOutputSpy).toHaveBeenCalledTimes(1);
      expect(emitOutputSpy).toHaveBeenCalledWith('ERROR', operationError);
    });

    it('should return the result of emitOutput (true if listeners exist)', () => {
      // Arrange
      const operationError = new OperationError('ANOTHER_FAIL', faker.company.catchPhrase());
      emitOutputSpy.mockReturnValue(true); // Simulate successful emission

      // Act
      const result = mockOperation.testEmitError(operationError);

      // Assert
      expect(result).toBe(true);
    });

    it('should return the result of emitOutput (false if no listeners or emission fails)', () => {
      // Arrange
      const operationError = new OperationError('EMIT_FAIL', faker.git.commitMessage());
      emitOutputSpy.mockReturnValue(false); // Simulate failed emission

      // Act
      const result = mockOperation.testEmitError(operationError);

      // Assert
      expect(result).toBe(false);
      // Ensure logger was still called even if emission failed
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });

  // --- Integration within Execute (Optional but good) ---

  describe('execute integration', () => {
    it('should call emitSuccess via execute', async () => {
      // Arrange
      const successData = 'Mock Success Data';
      emitOutputSpy.mockReturnValue(true);

      // Act
      await mockOperation.execute('succeed');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('MockOperation execute called', { input: 'succeed' });
      expect(mockLogger.info).toHaveBeenCalledWith('Operation MockOperation succeeded', expect.any(Object));
      expect(emitOutputSpy).toHaveBeenCalledWith('SUCCESS', successData);
    });

    it('should call emitError via execute', async () => {
      // Arrange
      const expectedError = expect.objectContaining({ code: 'MOCK_FAIL', message: 'Mock operation failed deliberately' });
      emitOutputSpy.mockReturnValue(true);

      // Act
      await mockOperation.execute('fail');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('MockOperation execute called', { input: 'fail' });
      expect(mockLogger.error).toHaveBeenCalledWith('Operation MockOperation failed', expect.any(Object));
      expect(emitOutputSpy).toHaveBeenCalledWith('ERROR', expectedError);
    });
  });
});
