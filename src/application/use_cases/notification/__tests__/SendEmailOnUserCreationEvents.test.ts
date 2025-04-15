import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SendEmailOnUserCreation } from '../SendEmailOnUserCreation';
import { TokenCreatedEvent } from '@enterprise/events/token';
import { UserResponseDTO } from '@enterprise/dto/output';
import { TokenType, UserRole } from '@enterprise/enum';
import { IEmailService } from '@application/contracts/communication/email';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

// Mock Operation class
jest.mock('@application/use_cases/base', () => {
  class MockOperation {
    outputs: Record<string, any>;
    subscribeTo = jest.fn();
    emitOutput = jest.fn();

    constructor(outputNames: string[]) {
      this.outputs = outputNames.reduce((acc, name) => ({
        ...acc,
        [name]: name
      }), {});
    }
  }

  return {
    Operation: MockOperation
  };
});

describe('SendEmailOnUserCreation', () => {
  // Mock dependencies
  const mockEmailService: jest.Mocked<IEmailService> = {
    sendEmail: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfig: jest.Mocked<IConfig> = {
    server: { host: 'http://example.com' },
    jwt: {
      accessExpirationMinutes: 60,
      verificationExpirationDays: 7
    },
  } as any;

  const mockLogger: jest.Mocked<ILogger> = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockTokenRepository: jest.Mocked<ITokenRepository> = {
    findByUserId: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
    findByToken: jest.fn(),
    update: jest.fn(),
    revoke: jest.fn(),
    removeExpired: jest.fn()
  };

  const mockUserRepository: jest.Mocked<IUserRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    findAll: jest.fn()
  };

  let sendEmailOnUserCreation: SendEmailOnUserCreation;
  let subscribeSpy: ReturnType<typeof jest.spyOn>;

  // Test data
  const mockUser: UserResponseDTO = {
    isVerified: false,
    role: UserRole.USER,
    username: 'testuser',
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User'
  };

  const mockToken = {
    id: 'token-123',
    token: 'verification-token-123',
    userId: 'user-123',
    type: TokenType.VERIFICATION,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    isRevoked: false,
    isExpired: () => false,
    isValid: () => true
  };

  const mockTokenCreatedEvent: TokenCreatedEvent = new TokenCreatedEvent(mockUser);

  beforeEach(() => {
    jest.clearAllMocks();

    sendEmailOnUserCreation = new SendEmailOnUserCreation(
      mockTokenRepository,
      mockUserRepository,
      mockEmailService,
      mockConfig,
      mockLogger
    );

    // Spy on subscribeTo method
    subscribeSpy = jest.spyOn(sendEmailOnUserCreation, 'subscribeTo' as any);
  });

  describe('bootstrap', () => {
    it('should subscribe to TokenCreated event', () => {
      sendEmailOnUserCreation.bootstrap();

      expect(subscribeSpy).toHaveBeenCalledWith(
        'TokenCreated',
        expect.any(Function)
      );
    });

    it('should handle errors during event subscription', async () => {
      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnUserCreation as any, 'emitOutput');

      // Mock handleTokenCreated to throw an error
      const handleTokenCreatedSpy = jest.spyOn(sendEmailOnUserCreation as any, 'handleTokenCreated')
        .mockRejectedValue(new Error('Test error'));

      // Get the event handler passed to subscribeTo
      sendEmailOnUserCreation.bootstrap();
      const eventHandler = subscribeSpy.mock.calls[0][1];

      // Call the event handler
      await eventHandler(mockTokenCreatedEvent);

      // Verify logger.error was called
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error handling TokenCreated event',
        expect.objectContaining({
          userId: mockUser.id,
          error: 'Test error'
        })
      );

      // Verify emitOutput was called with ERROR
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'ERROR',
        expect.any(Error)
      );
    });
  });

  describe('handleTokenCreated', () => {
    it('should log information and call execute', async () => {
      // Create spies
      const executeSpy = jest.spyOn(sendEmailOnUserCreation as any, 'execute')
        .mockResolvedValue(undefined);

      // Call the method directly
      await (sendEmailOnUserCreation as any).handleTokenCreated(mockTokenCreatedEvent);

      // Verify logger.info was called
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Verification token created event received, preparing to send email',
        expect.objectContaining({
          userId: mockUser.id
        })
      );

      // Verify execute was called with the user
      expect(executeSpy).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('execute', () => {
    it('should emit USER_ALREADY_VERIFIED event when user is already verified', async () => {
      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnUserCreation as any, 'emitOutput');

      // Create a verified user
      const verifiedUser = { ...mockUser, isVerified: true };

      // Call execute
      await sendEmailOnUserCreation.execute(verifiedUser);

      // Expect USER_ALREADY_VERIFIED event to be emitted
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'USER_ALREADY_VERIFIED',
        { userId: verifiedUser.id, email: verifiedUser.email }
      );

      // Expect no emails to be sent
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();

      // Expect no token lookup
      expect(mockTokenRepository.findByUserId).not.toHaveBeenCalled();

      // Expect a log message indicating the user is already verified
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User is already verified, skipping verification email',
        expect.objectContaining({
          userId: verifiedUser.id,
          email: verifiedUser.email
        })
      );
    });

    it('should send verification email successfully', async () => {
      // Arrange
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockResolvedValue(undefined);

      // Create a token for verification email
      mockTokenRepository.findByUserId.mockResolvedValue([mockToken]);

      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnUserCreation as any, 'emitOutput');

      // Act
      await (sendEmailOnUserCreation as any).execute(mockUser);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalledWith();

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: mockUser.email,
        subject: "[PPL] Validate Your User Account",
        template: "email-verification-token",
        context: expect.objectContaining({
          name: mockUser.name,
          verificationUrl: expect.stringContaining(mockToken.token),
          expiresInHours: expect.any(Number),
          currentYear: expect.any(Number)
        })
      });

      expect(emitOutputSpy).toHaveBeenCalledWith('EMAIL_SENT', {
        userId: mockUser.id,
        email: mockUser.email
      });
    });

    it('should emit NOTFOUND_VERIFICATION_TOKEN when no verification token is found', async () => {
      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnUserCreation as any, 'emitOutput');

      // Mock the tokenRepository to return an empty array (no tokens found)
      mockTokenRepository.findByUserId.mockResolvedValue([]);

      // Call execute directly with the mock user
      await sendEmailOnUserCreation.execute(mockUser);

      // Verify that the appropriate output was emitted
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'NOTFOUND_ERROR',
        `No verification token found for user: ${mockUser.id}`
      );

      // Verify that logger.info was called with appropriate message
      expect(mockLogger.info).toHaveBeenCalledWith(
        `No verification token found for user: ${mockUser.id}`,
        { userId: mockUser.id }
      );

      // Verify that email was not sent
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it('should handle email service unavailability', async () => {
      // Arrange
      mockEmailService.verify.mockResolvedValue(false);
      mockTokenRepository.findByUserId.mockResolvedValue([mockToken]);

      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnUserCreation as any, 'emitOutput');

      // Act
      await (sendEmailOnUserCreation as any).execute(mockUser);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalledWith();

      // Email should not be sent
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();

      // Verify emitOutput was called with AVAILABILITY_ERROR
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'AVAILABILITY_ERROR',
        expect.stringContaining('There was an error with the availability of the SMTP server;\n' +
          '          Try to check with the administrator of the system')
      );
    });

    it('should handle error when sending email', async () => {
      // Arrange
      const testError = new Error('Failed to send email');
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockRejectedValue(testError);
      mockTokenRepository.findByUserId.mockResolvedValue([mockToken]);

      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnUserCreation as any, 'emitOutput');

      // Act
      await (sendEmailOnUserCreation as any).execute(mockUser);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalledWith();
      expect(mockEmailService.sendEmail).toHaveBeenCalled();

      // Verify emitOutput was called with ERROR
      expect(emitOutputSpy).toHaveBeenCalledWith('ERROR', testError);
    });
  });
});
