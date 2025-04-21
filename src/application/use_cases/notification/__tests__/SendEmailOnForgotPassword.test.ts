import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

// --- Interfaces and Types to Mock ---
import { IEmailService } from '@application/contracts/communication/email';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { OperationError } from '@application/use_cases/base';
import { TokenResponseDTO, UserResponseDTO } from '@enterprise/dto/output';
import { ForgotPasswordEvent } from '@enterprise/events/auth';
import { UserRole, TokenType } from '@enterprise/enum';

// --- Class Under Test ---
import { SendEmailOnForgotPassword } from '@application/use_cases/notification';

// --- Mocks ---

const mockEmailService: jest.Mocked<IEmailService> = {
  sendEmail: jest.fn(),
  verify: jest.fn()
};

// Mock the nested structure of IConfig
const mockConfig: jest.Mocked<IConfig> = {
  env: 'test',
  MONGOOSE_DEBUG: false,
  jwt: {
    secret: faker.string.alphanumeric(32),
    accessExpirationMinutes: 15,
    refreshExpirationDays: 7,
    resetPasswordExpirationMinutes: 10,
    verifyEmailExpirationMinutes: 60,
  },
  db: 'mongodb://mock-url',
  db_config: {
    useNewUrlParser: false,
    useUnifiedTopology: false
  },
  redis: {
    host: 'redis://mock-redis',
    port: 2222
  },
  storage: {
    type: 'local',
    aws: {
      bucketName: '',
      accessKeyId: '',
      secretAccessKey: '',
      region: '',
    }
  },
  server: {
    protocol: '',
    host: '',
    port: 5555,
    version: ''
  },
  smtp: {
    host: 'mock-smtp',
    port: 587,
    secure: false,
    debug: false,
    username: '',
    password: '',
    from: ''
  }
};

const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// --- Helper Functions ---

const createFakeUserResponseDTO = (): UserResponseDTO => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  username: faker.internet.username(),
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  isVerified: true,
  name: faker.person.fullName(),
});

const createFakeTokenResponseDTO = (userId: string): TokenResponseDTO => ({
  id: faker.string.uuid(),
  userId: userId,
  token: faker.string.alphanumeric(40),
  type: TokenType.RESET_PASSWORD, // Assuming this context
  expiresAt: faker.date.future({ years: 0.01 }), // Expires soon, but in the future
  isRevoked: false,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  // Mock methods if they were needed, but DTOs usually don't have complex logic
  isExpired: jest.fn(() => false),
  isValid: jest.fn(() => true)
});

// --- Test Suite ---

describe('SendEmailOnForgotPassword Use Case', () => {
  let sendEmailOnForgotPassword: SendEmailOnForgotPassword;
  let fakeUser: UserResponseDTO;
  let fakeToken: TokenResponseDTO;
  const fixedTime = new Date('2024-03-10T12:00:00.000Z');

  // Mock event handlers
  let onSuccess: jest.Mock;
  let onError: jest.Mock;
  let onAvailabilityError: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();

    // Use fake timers to control Date.now() for consistency (e.g., for currentYear in email context)
    jest.useFakeTimers();
    jest.setSystemTime(fixedTime);

    // Instantiate the use case with mocks
    sendEmailOnForgotPassword = new SendEmailOnForgotPassword(mockEmailService, mockConfig, mockLogger);

    // Initialize mock event handlers
    onSuccess = jest.fn();
    onError = jest.fn();
    onAvailabilityError = jest.fn();

    // Attach mock handlers to the use case instance
    sendEmailOnForgotPassword.on('SUCCESS', onSuccess);
    sendEmailOnForgotPassword.on('ERROR', onError);
    sendEmailOnForgotPassword.on('AVAILABILITY_ERROR', onAvailabilityError);

    // Prepare default fake data
    fakeUser = createFakeUserResponseDTO();
    fakeToken = createFakeTokenResponseDTO(fakeUser.id);
  });

  afterEach(() => {
    // Restore real timers after each test
    jest.useRealTimers();
  });

  // --- Test Cases for 'execute' method ---

  describe('execute', () => {
    it('should emit SUCCESS when email service is available and email sends successfully', async () => {
      // Arrange
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockResolvedValue(undefined); // Simulate successful sending

      const expectedSuccessPayload = {
        userId: fakeUser.id,
        email: fakeUser.email
      };
      const expectedResetUrl = `${mockConfig.server.host}/auth/reset-pass?token=${fakeToken.token}`;
      const expectedExpiresInHours = mockConfig.jwt.resetPasswordExpirationMinutes / 60;
      const expectedCurrentYear = fixedTime.getFullYear();

      // Act
      await sendEmailOnForgotPassword.execute(fakeUser, fakeToken);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: fakeUser.email,
        subject: '[PPL] Reset Your Password',
        template: 'reset-password',
        context: {
          name: fakeUser.name,
          resetPassUrl: expectedResetUrl,
          expiresInHours: expectedExpiresInHours,
          currentYear: expectedCurrentYear
        }
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(expectedSuccessPayload);
      expect(onError).not.toHaveBeenCalled();
      expect(onAvailabilityError).not.toHaveBeenCalled();

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`SendEmailOnForgotPassword operation started for user: ${fakeUser.id}`),
        expect.any(Object)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Verifying email service availability.',
        expect.any(Object)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Email service is available.', expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`Sending password reset email to ${fakeUser.email}`),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Operation SendEmailOnForgotPassword succeeded',
        expect.objectContaining({ data: expectedSuccessPayload })
      );
    });

    it('should emit AVAILABILITY_ERROR when email service verify returns false', async () => {
      // Arrange
      mockEmailService.verify.mockResolvedValue(false);
      const expectedErrorMessage = 'Email service unavailable. Please try again later or contact support.';

      // Act
      await sendEmailOnForgotPassword.execute(fakeUser, fakeToken);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled(); // Should not attempt to send

      expect(onAvailabilityError).toHaveBeenCalledTimes(1);
      expect(onAvailabilityError).toHaveBeenCalledWith(expectedErrorMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      // Verify logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Email service is currently unavailable. Cannot send reset password email.',
        expect.objectContaining({ userId: fakeUser.id })
      );
    });

    it('should emit ERROR when emailService.sendEmail rejects with an Error', async () => {
      // Arrange
      const sendError = new Error('SMTP connection failed');
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockRejectedValue(sendError);

      const expectedOperationError = new OperationError(
        'EMAIL_SEND_FAILED',
        `Failed to send password reset email to ${fakeUser.email}: ${sendError.message}`,
        sendError
      );

      // Act
      await sendEmailOnForgotPassword.execute(fakeUser, fakeToken);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(1); // Verify it was attempted

      expect(onError).toHaveBeenCalledTimes(1);
      // Use expect.objectContaining because the internal error object might not be strictly identical
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: expectedOperationError.code,
        message: expectedOperationError.message,
        details: expectedOperationError.details // Check if the original error is wrapped
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onAvailabilityError).not.toHaveBeenCalled();

      // Verify logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Operation SendEmailOnForgotPassword failed',
        expect.objectContaining({ error: expect.objectContaining({ code: 'EMAIL_SEND_FAILED' }) })
      );
    });

    it('should emit ERROR when emailService.sendEmail rejects with a non-Error value', async () => {
      // Arrange
      const sendErrorValue = 'Something bad happened';
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockRejectedValue(sendErrorValue); // Reject with a string

      const expectedOperationError = new OperationError(
        'EMAIL_SEND_FAILED',
        `Failed to send password reset email to ${fakeUser.email}: ${sendErrorValue}`,
        new Error(sendErrorValue) // BaseOperation wraps non-errors in a new Error
      );

      // Act
      await sendEmailOnForgotPassword.execute(fakeUser, fakeToken);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(1);

      expect(onError).toHaveBeenCalledTimes(1);
      // Check the structure and content of the emitted OperationError
      const emittedError = onError.mock.calls[0][0] as OperationError;
      expect(emittedError).toBeInstanceOf(OperationError);
      expect(emittedError.code).toBe(expectedOperationError.code);
      expect(emittedError.message).toBe(expectedOperationError.message);
      // Check that the details property is an Error instance wrapping the original value
      expect(emittedError.details).toBeInstanceOf(Error);
      expect((emittedError.details as Error).message).toBe(sendErrorValue);

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onAvailabilityError).not.toHaveBeenCalled();

      // Verify logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Operation SendEmailOnForgotPassword failed',
        expect.objectContaining({ error: expect.objectContaining({ code: 'EMAIL_SEND_FAILED' }) })
      );
    });
  });

  // --- Test Cases for 'bootstrap' method (Optional - Focus on event subscription setup) ---
  // Note: Testing the actual event handling within bootstrap often overlaps with 'execute' tests.
  // A simple test here ensures the subscription is attempted. Testing the async callback
  // error handling within the bootstrap is more complex and might be better suited for integration tests.

  describe('bootstrap', () => {
    it('should subscribe to the ForgotPassword event', () => {
      // Arrange
      // Spy on the 'subscribeTo' method inherited/implemented by the class
      const subscribeToSpy = jest.spyOn(sendEmailOnForgotPassword as any, 'subscribeTo'); // Use 'as any' if private/protected

      // Act
      sendEmailOnForgotPassword.bootstrap();

      // Assert
      expect(subscribeToSpy).toHaveBeenCalledTimes(1);
      expect(subscribeToSpy).toHaveBeenCalledWith('ForgotPassword', expect.any(Function));

      // Cleanup spy
      subscribeToSpy.mockRestore();
    });

    // Example of testing the error handling within the event handler (more advanced)
    it('should log an error if handling the ForgotPassword event fails', async () => {
      // Arrange
      const eventHandlerError = new Error('Execution failed');
      const fakeEvent = new ForgotPasswordEvent(fakeUser, fakeToken);

      // Mock the internal execute method to throw an error when called by the handler
      const executeSpy = jest.spyOn(sendEmailOnForgotPassword, 'execute').mockRejectedValue(eventHandlerError);

      // Spy on the logger to check error logging
      const loggerErrorSpy = jest.spyOn(mockLogger, 'error');

      // Mock 'subscribeTo' to capture the handler and call it immediately
      const subscribeToSpy = jest.spyOn(sendEmailOnForgotPassword as any, 'subscribeTo')
        .mockImplementation((...args: unknown[]) => {
          if (args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'function') {
            const eventName = args[0] as string;
            const handler = args[1] as (event: ForgotPasswordEvent) => void | Promise<void>; // Cast the handler

            if (eventName === 'ForgotPassword') {
              process.nextTick(() => {
                try {
                  const result = handler(fakeEvent);
                  if (result instanceof Promise) {
                    result.catch(err => {
                      console.error("Handler promise rejected in mock:", err);
                    });
                  }
                } catch (err) {
                  console.error("Handler threw an error in mock:", err);
                }
              });
            }
          } else {
            console.warn('subscribeTo mock called with unexpected arguments:', args);
          }
        });

      // Act
      sendEmailOnForgotPassword.bootstrap();

      // Need to wait for the async handler to potentially complete/fail
      // Using Jest's modern fake timers can help manage this more deterministically
      // Or introduce a small delay if necessary, though less ideal
      jest.runAllTicks(); // Process the nextTick queue

      // Assert
      expect(executeSpy).toHaveBeenCalledWith(fakeUser, fakeToken); // Ensure execute was called
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1); // Check if logger.error was called by the catch block
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Error handling ForgotPassword event for user ${fakeUser.id}`),
        expect.objectContaining({
          error: eventHandlerError, // Check if the original error is logged
          userId: fakeUser.id
        })
      );

      // Cleanup spies
      subscribeToSpy.mockRestore();
      executeSpy.mockRestore();
      // loggerErrorSpy is a mock function, reset handled by beforeEach
    });
  });
});
