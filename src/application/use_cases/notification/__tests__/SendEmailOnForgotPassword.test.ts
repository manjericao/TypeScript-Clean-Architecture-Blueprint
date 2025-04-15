import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SendEmailOnForgotPassword } from './../SendEmailOnForgotPassword';
import { ForgotPasswordEvent } from '@enterprise/events/auth';
import { UserResponseDTO } from '@enterprise/dto/output';
import { TokenType, UserRole } from '@enterprise/enum';
import { IEmailService } from '@application/contracts/communication/email';
import { IConfig, ILogger } from '@application/contracts/infrastructure';

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

describe('SendEmailOnForgotPassword', () => {
  // Mock dependencies
  const mockEmailService: jest.Mocked<IEmailService> = {
    sendEmail: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfig: jest.Mocked<IConfig> = {
    server: { host: 'http://example.com' },
    jwt: {
      resetPasswordExpirationMinutes: 120 // 2 hours
    },
  } as any;

  const mockLogger: jest.Mocked<ILogger> = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  let sendEmailOnForgotPassword: SendEmailOnForgotPassword;
  let subscribeSpy: ReturnType<typeof jest.spyOn>;

  // Test data
  const mockUser: UserResponseDTO = {
    isVerified: false,
    role: UserRole.USER,
    username: 'Uas',
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User'
  };

  const mockToken = 'forgot-password-token-123';

  const mockForgotPasswordEvent = new ForgotPasswordEvent(
    mockUser,
    {
      id: 'token-123',
      token: mockToken,
      userId: '',
      type: TokenType.ACCESS,
      expiresAt: new Date(),
      isRevoked: false,
      isExpired: () => false,
      isValid: () => true
    }
  );

  beforeEach(() => {
    jest.clearAllMocks();

    sendEmailOnForgotPassword = new SendEmailOnForgotPassword(
      mockEmailService,
      mockConfig,
      mockLogger
    );

    // Spy on subscribeTo method
    subscribeSpy = jest.spyOn(sendEmailOnForgotPassword, 'subscribeTo' as any);
  });

  describe('bootstrap', () => {
    it('should subscribe to ForgotPassword event', () => {
      sendEmailOnForgotPassword.bootstrap();

      expect(subscribeSpy).toHaveBeenCalledWith(
        'ForgotPassword',
        expect.any(Function)
      );
    });

    it('should handle errors during event subscription', async () => {
      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnForgotPassword as any, 'emitOutput');

      // Mock handleForgotPassword to throw an error
      const handleForgotPasswordSpy = jest.spyOn(sendEmailOnForgotPassword as any, 'handleForgotPassword')
        .mockRejectedValue(new Error('Test error'));

      // Get the event handler passed to subscribeTo
      sendEmailOnForgotPassword.bootstrap();
      const eventHandler = subscribeSpy.mock.calls[0][1];

      // Call the event handler
      await eventHandler(mockForgotPasswordEvent);

      // Verify logger.error was called
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error handling ForgotPassword event',
        expect.objectContaining({
          userId: mockUser.id,
          token: mockToken
        })
      );

      // Verify emitOutput was called with ERROR
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'ERROR',
        expect.any(Error)
      );
    });
  });

  describe('execute', () => {
    it('should send reset password email successfully', async () => {
      // Arrange
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockResolvedValue(undefined);

      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnForgotPassword as any, 'emitOutput');

      // Act
      await sendEmailOnForgotPassword.execute(mockUser, mockToken);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalled();
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: mockUser.email,
        subject: '[PPL] Reset Your Password',
        template: 'reset-password',
        context: {
          name: mockUser.name,
          resetPassUrl: `${mockConfig.server.host}/auth/reset-pass?token=${mockToken}`,
          expiresInHours: 2,
          currentYear: new Date().getFullYear()
        }
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Reset password email sent successfully',
        { userId: mockUser.id, email: mockUser.email }
      );

      // Use the spy to verify the protected method call
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'EMAIL_SENT',
        { userId: mockUser.id, email: mockUser.email }
      );
    });

    it('should handle email service unavailability', async () => {
      // Arrange
      mockEmailService.verify.mockResolvedValue(false);

      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnForgotPassword as any, 'emitOutput');

      // Act
      await sendEmailOnForgotPassword.execute(mockUser, mockToken);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalled();
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();

      // Use the spy to verify the protected method call
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'AVAILABILITY_ERROR',
        expect.any(String)
      );
    });

    it('should handle errors during email sending', async () => {
      // Arrange
      mockEmailService.verify.mockResolvedValue(true);
      mockEmailService.sendEmail.mockRejectedValue(new Error('Email sending failed'));

      // Create a spy on the protected emitOutput method
      const emitOutputSpy = jest.spyOn(sendEmailOnForgotPassword as any, 'emitOutput');

      // Act
      await sendEmailOnForgotPassword.execute(mockUser, mockToken);

      // Assert
      expect(mockEmailService.verify).toHaveBeenCalled();
      expect(mockEmailService.sendEmail).toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error sending reset password email',
        expect.objectContaining({
          userId: mockUser.id
        })
      );

      // Use the spy to verify the protected method call
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'ERROR',
        expect.any(Error)
      );
    });
  });

  describe('handleForgotPassword', () => {
    it('should log and execute email sending for forgot password event', async () => {
      // Create a spy on execute method
      const executeSpy = jest.spyOn(sendEmailOnForgotPassword, 'execute');

      // Act
      await (sendEmailOnForgotPassword as any).handleForgotPassword(mockForgotPasswordEvent);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Verification token created event received, preparing to send email',
        {
          userId: mockUser.id,
          tokenId: mockForgotPasswordEvent.token.id
        }
      );

      expect(executeSpy).toHaveBeenCalledWith(
        mockForgotPasswordEvent.user,
        mockForgotPasswordEvent.token.token
      );
    });
  });
});
