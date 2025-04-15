import { ResetPassword } from '@application/use_cases/auth';
import { ResetPasswordDTO } from '@enterprise/dto/input/auth';
import { TokenType, UserRole } from '@enterprise/enum';
import { v4 as uuidv4 } from 'uuid';
import { UpdateUserDTO } from '@enterprise/dto/input/user';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

describe('ResetPassword', () => {
  // Mock dependencies
  const mockUserRepository: jest.Mocked<IUserRepository> = {
    findById: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<IUserRepository>;

  const mockTokenRepository: jest.Mocked<ITokenRepository> = {
    findByToken: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<ITokenRepository>;

  const mockPasswordHasher: jest.Mocked<IPasswordHasher> = {
    hashPassword: jest.fn(),
  } as unknown as jest.Mocked<IPasswordHasher>;

  const mockLogger: jest.Mocked<ILogger> = {
    info: jest.fn(),
    error: jest.fn(),
  } as unknown as jest.Mocked<ILogger>;

  let resetPassword: ResetPassword;
  let mockEmitSpy: jest.SpyInstance;

  // Test data
  const userId = uuidv4();
  const testToken = 'valid-reset-token';
  const newPassword = 'NewPassword123!';
  const hashedPassword = 'hashed-new-password';

  const validTokenRecord = {
    id: uuidv4(),
    token: testToken,
    userId,
    type: TokenType.RESET_PASSWORD,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000),
    isExpired: () => false,
    isValid: () => true
  };

  const validUser = {
    name: 'User',
    username: 'test',
    role: UserRole.USER,
    id: userId,
    email: 'test@example.com',
    isVerified: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetPassword = new ResetPassword(
      mockUserRepository,
      mockTokenRepository,
      mockPasswordHasher,
      mockLogger
    );
    mockEmitSpy = jest.spyOn(resetPassword as any, 'emitOutput');
  });

  const resetPasswordDTO: ResetPasswordDTO = {
    token: testToken,
    newPassword,
  };

  describe('execute', () => {
    it('should successfully reset password', async () => {
      // Arrange
      const updateData: Partial<UpdateUserDTO> = {
        password: hashedPassword,
      };

      mockTokenRepository.findByToken.mockResolvedValue(validTokenRecord);
      mockUserRepository.findById.mockResolvedValue(validUser);
      mockPasswordHasher.hashPassword.mockResolvedValue(hashedPassword);
      mockUserRepository.update.mockResolvedValue({
        ...validUser,
      });

      // Set up event handler
      const successHandler = jest.fn();
      resetPassword.on('SUCCESS', successHandler);

      // Act
      await resetPassword.execute(resetPasswordDTO);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(testToken);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockPasswordHasher.hashPassword).toHaveBeenCalledWith(newPassword);
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        userId,
        expect.objectContaining<Partial<UpdateUserDTO>>({
          password: hashedPassword,
        })
      );
      expect(mockTokenRepository.delete).toHaveBeenCalledWith(expect.anything());

      expect(mockEmitSpy).toHaveBeenCalledWith('SUCCESS', {
        message: 'Password reset successful'
      });
      expect(successHandler).toHaveBeenCalledWith({
        message: 'Password reset successful'
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Password successfully reset',
        { userId }
      );
    });

    it('should emit TOKEN_NOT_FOUND when token does not exist', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(undefined);

      // Act
      await resetPassword.execute(resetPasswordDTO);

      // Assert
      expect(mockEmitSpy).toHaveBeenCalledWith(
        'TOKEN_NOT_FOUND',
        'Invalid or expired reset token'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Reset password token not found'
      );
    });

    it('should emit INVALID_TOKEN when token type is incorrect', async () => {
      // Arrange
      const invalidTokenRecord = {
        ...validTokenRecord,
        type: TokenType.ACCESS,
      };
      mockTokenRepository.findByToken.mockResolvedValue(invalidTokenRecord);

      // Act
      await resetPassword.execute(resetPasswordDTO);

      // Assert
      expect(mockEmitSpy).toHaveBeenCalledWith(
        'INVALID_TOKEN',
        'Invalid reset token'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid token type for password reset'
      );
    });

    it('should emit TOKEN_EXPIRED when token has expired', async () => {
      // Arrange
      const expiredTokenRecord = {
        ...validTokenRecord,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour in the past
      };
      mockTokenRepository.findByToken.mockResolvedValue(expiredTokenRecord);

      // Act
      await resetPassword.execute(resetPasswordDTO);

      // Assert
      expect(mockEmitSpy).toHaveBeenCalledWith(
        'TOKEN_EXPIRED',
        'Reset token has expired'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Reset password token expired'
      );
    });

    it('should emit TOKEN_NOT_FOUND when user is not found', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(validTokenRecord);
      mockUserRepository.findById.mockResolvedValue(undefined);

      // Act
      await resetPassword.execute(resetPasswordDTO);

      // Assert
      expect(mockEmitSpy).toHaveBeenCalledWith(
        'TOKEN_NOT_FOUND',
        'User not found'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'User not found for reset token'
      );
    });

    it('should emit ERROR when an unexpected error occurs', async () => {
      // Arrange
      const testError = new Error('Unexpected error');
      mockTokenRepository.findByToken.mockRejectedValue(testError);

      // Act
      await resetPassword.execute(resetPasswordDTO);

      // Assert
      expect(mockEmitSpy).toHaveBeenCalledWith('ERROR', testError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in password reset process',
        testError
      );
    });
  });
});
