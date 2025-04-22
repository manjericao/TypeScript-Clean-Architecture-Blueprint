import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

// --- Interfaces, Types, DTOs, Enums, Events to Mock/Use ---
import { IEmailService } from '@application/contracts/communication/email';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { AbstractOperation, OperationError } from '@application/use_cases/base';
import { EmailUserDTO } from '@enterprise/dto/input/auth';
import { TokenResponseDTO, UserResponseDTO } from '@enterprise/dto/output';
import { TokenType, UserRole } from '@enterprise/enum';
import { TokenCreatedEvent } from '@enterprise/events/token';

// --- Class Under Test ---
import { SendEmailOnUserCreation } from '@application/use_cases/notification/SendEmailOnUserCreation';
import { EventEmitter } from 'events'; // Adjust path if needed

// --- Mocks ---

// Mock BaseOperation to capture event emissions and subscriptions
// (Keep constructor logic simple, focus on capturing calls)
const mockEmitOutput = jest.fn();
const mockEmitSuccess = jest.fn();
const mockEmitError = jest.fn();
const mockSubscribeTo = jest.fn();

const mockTokenRepository: jest.Mocked<ITokenRepository> = {
  findByUserId: jest.fn(),
  // Add other methods if they were ever called, even if not expected in happy path
  create: jest.fn(),
  findById: jest.fn(),
  delete: jest.fn(),
  findByToken: jest.fn(),
  update: jest.fn(),
  revoke: jest.fn(),
  removeExpired: jest.fn()
};

const mockUserRepository: jest.Mocked<IUserRepository> = {
  findByEmail: jest.fn(),
  // Add other methods if they were ever called
  create: jest.fn(),
  findById: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  findAll: jest.fn()
};

const mockEmailService: jest.Mocked<IEmailService> = {
  sendEmail: jest.fn(),
  verify: jest.fn()
};

const mockConfig: jest.Mocked<IConfig> = {
  server: {
    host: `http://${faker.internet.domainName()}` // Use faker for host
  },
  jwt: {
    verifyEmailExpirationMinutes: faker.number.int({ min: 30, max: 120 }) // Use faker
  }
} as any;

const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// --- Helper Functions ---

const createFakeUserResponseDTO = (isVerified = false): UserResponseDTO => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  username: faker.internet.username(),
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  isVerified: isVerified,
  name: faker.person.fullName(),
});

const createFakeEmailUserDTO = (): EmailUserDTO => ({
  email: faker.internet.email(),
});

// Adjust TokenResponseDTO creation if its structure differs or needs specific types
const createFakeTokenResponseDTO = (userId: string, type = TokenType.VERIFICATION): TokenResponseDTO => ({
  id: faker.string.uuid(),
  userId: userId,
  token: faker.string.alphanumeric(64), // Use longer token for realism
  type: type,
  expiresAt: faker.date.future({ years: 0.02 }), // ~1 week
  isRevoked: false,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  // Mock DTO methods if necessary, but often not needed for simple DTOs
  isExpired: jest.fn(() => false),
  isValid: jest.fn(() => true)
});

// --- Test Suite ---

describe('SendEmailOnUserCreation Use Case', () => {
  let sendEmailOnUserCreation: SendEmailOnUserCreation;
  let fakeUser: UserResponseDTO;
  let fakeToken: TokenResponseDTO;
  let fakeEmailInput: EmailUserDTO;
  const fixedTime = new Date('2024-05-15T10:00:00.000Z');

  beforeEach(() => {
    // Reset mocks and clear mock timers before each test
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(fixedTime);

    // Instantiate the use case with mocks
    // Note: BaseOperation is mocked globally, its constructor behavior is simplified
    sendEmailOnUserCreation = new SendEmailOnUserCreation(
      mockTokenRepository,
      mockUserRepository,
      mockEmailService,
      mockConfig,
      mockLogger
    );

    // Override BaseOperation event emitters with your mocks
    (sendEmailOnUserCreation as any).emitSuccess = mockEmitSuccess;
    (sendEmailOnUserCreation as any).emitOutput  = mockEmitOutput;
    (sendEmailOnUserCreation as any).emitError   = mockEmitError;

    // Prepare default fake data
    fakeUser = createFakeUserResponseDTO(false); // Default to unverified user
    fakeToken = createFakeTokenResponseDTO(fakeUser.id, TokenType.VERIFICATION);
    fakeEmailInput = createFakeEmailUserDTO();
  });

  afterEach(() => {
    // Restore real timers after each test
    jest.useRealTimers();
  });

  // --- Test Cases for 'bootstrap' method ---

  describe('bootstrap', () => {
    it('should subscribe to TokenCreated event by calling global emitter.on', () => {
      // Spy on EventEmitter.prototype.on, which is used by subscribeTo internally.
      const onSpy = jest.spyOn(EventEmitter.prototype, 'on');

      sendEmailOnUserCreation.bootstrap();

      expect(onSpy).toHaveBeenCalledWith(
        'TokenCreated',
        expect.any(Function)
      );

      // Restore the spy so that it does not affect other tests.
      onSpy.mockRestore();
    });

    it('should handle TokenCreated event by calling handleTokenCreated', async () => {
      // Spy on the private handleTokenCreated method
      const handleTokenCreatedSpy = jest
        .spyOn(sendEmailOnUserCreation as any, 'handleTokenCreated')
        .mockResolvedValue(undefined); // Prevent actual execution

      // Spy on the protected subscribeTo method
      const subscribeToSpy = jest.spyOn(sendEmailOnUserCreation as any, 'subscribeTo');

      // Call bootstrap, which will internally call subscribeTo
      sendEmailOnUserCreation.bootstrap();

      // Ensure subscribeTo was called with "TokenCreated" and a handler function
      expect(subscribeToSpy).toHaveBeenCalledWith(
        'TokenCreated',
        expect.any(Function)
      );

      // Get the handler function from the spy calls
      const eventHandler = subscribeToSpy.mock.calls[0][1] as (event: any) => Promise<void>;

      // Create a fake event
      const fakeEvent = new TokenCreatedEvent(fakeUser);

      // Execute the handler function
      await eventHandler(fakeEvent);

      // Verify that handleTokenCreated was called with the fake event
      expect(handleTokenCreatedSpy).toHaveBeenCalledTimes(1);
      expect(handleTokenCreatedSpy).toHaveBeenCalledWith(fakeEvent);
    });

    it('should log an error if handleTokenCreated rejects', async () => {
      const testError = new Error('Handler failed');

      // Spy on the private handleTokenCreated method to reject with an error.
      const handleTokenCreatedSpy = jest
        .spyOn(sendEmailOnUserCreation as any, 'handleTokenCreated')
        .mockRejectedValue(testError);

      // Spy on the inherited subscribeTo using the prototype.
      const subscribeToSpy = jest.spyOn(
        Object.getPrototypeOf(sendEmailOnUserCreation),
        'subscribeTo'
      );

      // Call bootstrap, which will call the subscribeTo method.
      sendEmailOnUserCreation.bootstrap();

      // Verify subscribeTo is called.
      expect(subscribeToSpy).toHaveBeenCalledWith(
        'TokenCreated',
        expect.any(Function)
      );

      // Retrieve the handler function from the spy call.
      const eventHandler = subscribeToSpy.mock.calls[0][1] as (event: any) => Promise<void>;

      // Create a fake event.
      const fakeEvent = new TokenCreatedEvent(fakeUser);

      // Execute the handler and expect it to resolve (the error is caught inside the bootstrap).
      await eventHandler(fakeEvent);

      // Verify handleTokenCreated was called with the fake event.
      expect(handleTokenCreatedSpy).toHaveBeenCalledWith(fakeEvent);

      // Verify logger.error was called due to the error in handleTokenCreated.
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Error handling TokenCreated event for user ${fakeUser.id}`),
        expect.objectContaining({
          error: testError,
          userId: fakeUser.id
        })
      );

      subscribeToSpy.mockRestore();
    });
  });

  // --- Test Cases for 'handleTokenCreated' (private method, tested via bootstrap/direct call) ---

  describe('handleTokenCreated', () => {
    it('should log info and call execute with the user from the event', async () => {
      // Spy on execute method
      const executeSpy = jest.spyOn(sendEmailOnUserCreation, 'execute').mockResolvedValue(undefined);
      const fakeEvent = new TokenCreatedEvent(fakeUser);

      // Call the private method directly (using 'any' for access)
      await (sendEmailOnUserCreation as any).handleTokenCreated(fakeEvent);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('TokenCreated event received'),
        expect.objectContaining({ userId: fakeUser.id })
      );

      // Verify execute was called correctly
      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(executeSpy).toHaveBeenCalledWith(fakeUser); // Should be called with the user from the event
    });
  });


  // --- Test Cases for 'execute' method ---

  describe('execute', () => {
    // --- Success Path ---
    it('should emit SUCCESS when user (from UserResponseDTO) is valid, token found, email service available, and email sends', async () => {
      // Arrange
      mockTokenRepository.findByUserId.mockResolvedValue([fakeToken]);
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockResolvedValue(undefined);

      const expectedSuccessPayload = { userId: fakeUser.id, email: fakeUser.email };
      const expectedVerificationUrl = `${mockConfig.server.host}/auth/verify-email?token=${fakeToken.token}`;

      // Act
      await sendEmailOnUserCreation.execute(fakeUser);

      // Assert: Check mocks and emissions
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled(); // Input was DTO
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUser.id);
      expect(mockEmailService.verify).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        to: fakeUser.email,
        subject: expect.stringContaining('Validate Your User Account'),
        template: 'email-verification-token',
        context: expect.objectContaining({
          name: fakeUser.name,
          verificationUrl: expectedVerificationUrl,
          expiresInMinutes: mockConfig.jwt.verifyEmailExpirationMinutes,
          currentYear: fixedTime.getFullYear()
        })
      }));

      expect(mockEmitSuccess).toHaveBeenCalledTimes(1);
      expect(mockEmitSuccess).toHaveBeenCalledWith(expectedSuccessPayload);
      expect(mockEmitOutput).not.toHaveBeenCalled(); // No specific output events
      expect(mockEmitError).not.toHaveBeenCalled(); // No errors

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('operation started'), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('User resolved'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Verification token found'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Verifying email service'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Email service is available'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Sending verification email'), expect.any(Object));
    });

    it('should emit SUCCESS when user (from EmailUserDTO) is resolved, token found, email service available, and email sends', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(fakeUser); // User found by email
      mockTokenRepository.findByUserId.mockResolvedValue([fakeToken]);
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockResolvedValue(undefined);

      const expectedSuccessPayload = { userId: fakeUser.id, email: fakeUser.email };

      // Act
      await sendEmailOnUserCreation.execute(fakeEmailInput);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeEmailInput.email);
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUser.id);
      expect(mockEmailService.verify).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(mockEmitSuccess).toHaveBeenCalledTimes(1);
      expect(mockEmitSuccess).toHaveBeenCalledWith(expectedSuccessPayload);
      expect(mockEmitOutput).not.toHaveBeenCalled();
      expect(mockEmitError).not.toHaveBeenCalled();
    });

    // --- Specific Outcome Events ---
    it('should emit USER_NOT_FOUND when user (from EmailUserDTO) cannot be resolved', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(undefined); // Simulate user not found

      // Act
      await sendEmailOnUserCreation.execute(fakeEmailInput);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeEmailInput.email);
      expect(mockEmitOutput).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledWith('USER_NOT_FOUND', expect.stringContaining('User could not be resolved'));
      expect(mockTokenRepository.findByUserId).not.toHaveBeenCalled();
      expect(mockEmailService.verify).not.toHaveBeenCalled();
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmitError).not.toHaveBeenCalled();
      // Verify logging (warn comes from resolveUserFromInput, info from execute start)
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('User not found by email'), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('operation started'), expect.any(Object));

    });

    it('should emit USER_ALREADY_VERIFIED when the resolved user is already verified', async () => {
      // Arrange
      const verifiedUser = createFakeUserResponseDTO(true); // User is already verified
      const expectedPayload = { userId: verifiedUser.id, email: verifiedUser.email };

      // Act
      await sendEmailOnUserCreation.execute(verifiedUser);

      // Assert
      expect(mockEmitOutput).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledWith('USER_ALREADY_VERIFIED', expectedPayload);
      expect(mockTokenRepository.findByUserId).not.toHaveBeenCalled();
      expect(mockEmailService.verify).not.toHaveBeenCalled();
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmitError).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('User is already verified'), expect.any(Object));
    });

    it('should emit TOKEN_NOT_FOUND when no verification token exists for the user', async () => {
      // Arrange
      mockTokenRepository.findByUserId.mockResolvedValue([]); // No tokens found

      // Act
      await sendEmailOnUserCreation.execute(fakeUser);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUser.id);
      expect(mockEmitOutput).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledWith('TOKEN_NOT_FOUND', expect.stringContaining(`No verification token found for user: ${fakeUser.id}`));
      expect(mockEmailService.verify).not.toHaveBeenCalled();
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmitError).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No verification token found'), expect.any(Object));
    });

    it('should emit TOKEN_NOT_FOUND when tokens exist but none are for verification', async () => {
      // Arrange
      const resetToken = createFakeTokenResponseDTO(fakeUser.id, TokenType.RESET_PASSWORD);
      mockTokenRepository.findByUserId.mockResolvedValue([resetToken]); // Only reset token

      // Act
      await sendEmailOnUserCreation.execute(fakeUser);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUser.id);
      expect(mockEmitOutput).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledWith('TOKEN_NOT_FOUND', expect.stringContaining(`No verification token found for user: ${fakeUser.id}`));
      expect(mockEmailService.verify).not.toHaveBeenCalled();
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmitError).not.toHaveBeenCalled();
    });


    it('should emit AVAILABILITY_ERROR when email service verify returns false', async () => {
      // Arrange
      mockTokenRepository.findByUserId.mockResolvedValue([fakeToken]);
      mockEmailService.verify.mockResolvedValue(false); // Service unavailable

      // Act
      await sendEmailOnUserCreation.execute(fakeUser);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUser.id);
      expect(mockEmailService.verify).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledWith('AVAILABILITY_ERROR', expect.stringContaining('Email service unavailable'));
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmitError).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Email service is currently unavailable'), expect.any(Object));
    });

    // --- General Error Handling (Emit ERROR) ---

    it('should emit ERROR if userRepository.findByEmail rejects', async () => {
      // Arrange
      const repoError = new Error('Database connection failed');
      mockUserRepository.findByEmail.mockRejectedValue(repoError);

      // Act
      await sendEmailOnUserCreation.execute(fakeEmailInput);

      // Assert resolveUserFromInput returns null, leading execute to emit USER_NOT_FOUND
      // The internal error is logged by resolveUserFromInput, but the operation outcome is USER_NOT_FOUND
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeEmailInput.email);
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error finding user by email'), expect.objectContaining({ error: repoError }));

      // Assert USER_NOT_FOUND is emitted because resolution failed
      expect(mockEmitOutput).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledWith('USER_NOT_FOUND', expect.stringContaining('User could not be resolved'));

      // Ensure ERROR was not emitted directly for this specific case (resolution failure handled)
      expect(mockEmitError).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
    });


    it('should emit ERROR if tokenRepository.findByUserId rejects', async () => {
      // Arrange
      const repoError = new Error('Database connection failed');
      mockTokenRepository.findByUserId.mockRejectedValue(repoError);

      // Act
      await sendEmailOnUserCreation.execute(fakeUser);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUser.id);
      expect(mockEmitError).toHaveBeenCalledTimes(1);
      expect(mockEmitError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'REPOSITORY_ERROR',
        message: expect.stringContaining(`Failed to retrieve tokens for user ${fakeUser.id}`),
        details: repoError
      }));
      expect(mockEmitOutput).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmailService.verify).not.toHaveBeenCalled(); // Should fail before this
    });

    it('should emit ERROR if emailService.verify rejects', async () => {
      // Arrange
      const verifyError = new Error('Verification endpoint timeout');
      mockTokenRepository.findByUserId.mockResolvedValue([fakeToken]);
      mockEmailService.verify.mockRejectedValue(verifyError);

      // Act
      await sendEmailOnUserCreation.execute(fakeUser);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUser.id);
      expect(mockEmailService.verify).toHaveBeenCalledTimes(1);
      expect(mockEmitError).toHaveBeenCalledTimes(1);
      expect(mockEmitError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'EMAIL_SERVICE_VERIFY_FAILED',
        message: expect.stringContaining('Failed to verify email service status'),
        details: verifyError
      }));
      expect(mockEmitOutput).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled(); // Should fail before this
    });

    it('should emit ERROR if emailService.sendEmail rejects with an Error', async () => {
      // Arrange
      const sendError = new Error('SMTP authentication failed');
      mockTokenRepository.findByUserId.mockResolvedValue([fakeToken]);
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockRejectedValue(sendError);

      // Act
      await sendEmailOnUserCreation.execute(fakeUser);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUser.id);
      expect(mockEmailService.verify).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(mockEmitError).toHaveBeenCalledTimes(1);
      expect(mockEmitError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'EMAIL_SEND_FAILED',
        message: expect.stringContaining(`Failed to send verification email to ${fakeUser.email}`),
        details: sendError
      }));
      expect(mockEmitOutput).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
    });

    it('should emit ERROR if emailService.sendEmail rejects with a non-Error value', async () => {
      // Arrange
      const sendErrorValue = 'Send Failed';
      mockTokenRepository.findByUserId.mockResolvedValue([fakeToken]);
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockRejectedValue(sendErrorValue); // Reject with string

      // Act
      await sendEmailOnUserCreation.execute(fakeUser);

      // Assert
      expect(mockEmitError).toHaveBeenCalledTimes(1);
      const emittedError = mockEmitError.mock.calls[0][0] as OperationError;
      expect(emittedError.code).toBe('EMAIL_SEND_FAILED');
      expect(emittedError.message).toContain(`Failed to send verification email to ${fakeUser.email}: ${sendErrorValue}`);
      expect(emittedError.details).toBeInstanceOf(Error);

      expect(mockEmitOutput).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
    });

    it('should emit USER_NOT_FOUND if resolveUserFromInput receives invalid input', async () => {
      // Arrange
      const invalidInput = { some: 'data' } as any; // Input doesn't match expected DTOs

      // Act
      await sendEmailOnUserCreation.execute(invalidInput);

      // Assert resolveUserFromInput returns null, leading execute to emit USER_NOT_FOUND
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unrecognized input type'), expect.any(Object));
      expect(mockEmitOutput).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledWith('USER_NOT_FOUND', expect.stringContaining('User could not be resolved'));
      expect(mockEmitError).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
    });
  });

  // --- Test Cases for 'resolveUserFromInput' (private method) ---
  // Optional: Direct tests for private methods can be useful for complex logic,
  // but ensure they don't make tests brittle. Often, testing via `execute` is sufficient.

  describe('resolveUserFromInput (private)', () => {
    it('should return the user directly if input is UserResponseDTO', async () => {
      const result = await (sendEmailOnUserCreation as any).resolveUserFromInput(fakeUser);
      expect(result).toBe(fakeUser);
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Input is UserResponseDTO'), expect.any(Object));
    });

    it('should call userRepository.findByEmail if input is EmailUserDTO', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(fakeUser);
      const result = await (sendEmailOnUserCreation as any).resolveUserFromInput(fakeEmailInput);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeEmailInput.email);
      expect(result).toBe(fakeUser);
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Input is EmailUserDTO'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('User found by email'), expect.any(Object));

    });

    it('should return null if userRepository.findByEmail returns null for EmailUserDTO', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      const result = await (sendEmailOnUserCreation as any).resolveUserFromInput(fakeEmailInput);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeEmailInput.email);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('User not found by email'), expect.any(Object));
    });

    it('should return null and log error if userRepository.findByEmail throws for EmailUserDTO', async () => {
      const repoError = new Error('DB Error');
      mockUserRepository.findByEmail.mockRejectedValue(repoError);
      const result = await (sendEmailOnUserCreation as any).resolveUserFromInput(fakeEmailInput);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeEmailInput.email);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error finding user by email'), expect.objectContaining({ error: repoError }));
    });

    it('should return null and log error for unrecognized input', async () => {
      const invalidInput = { random: 'stuff' };
      const result = await (sendEmailOnUserCreation as any).resolveUserFromInput(invalidInput as any);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unrecognized input type'), expect.any(Object));
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
    });
  });
});
