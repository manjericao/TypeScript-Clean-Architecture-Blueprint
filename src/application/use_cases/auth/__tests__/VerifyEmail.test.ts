import { VerifyEmail } from '@application/use_cases/auth';
import { TokenType, UserRole } from '@enterprise/enum';
import { UserResponseDTO } from '@enterprise/dto/output';
import { v4 as uuidv4 } from 'uuid';
import { TokenResponseDTO } from '@enterprise/dto/output';
import { ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

describe('VerifyEmail', () => {
  // Mock dependencies
  const mockUserRepository: jest.Mocked<IUserRepository> = {
    findById: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    findByEmail: jest.fn(),
    delete: jest.fn(),
    findAll: jest.fn(),
  } as unknown as jest.Mocked<IUserRepository>;

  const mockTokenRepository: jest.Mocked<ITokenRepository> = {
    findByToken: jest.fn(),
    deleteByToken: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    update: jest.fn(),
    revoke: jest.fn(),
    delete: jest.fn(),
    removeExpired: jest.fn(),
  } as unknown as jest.Mocked<ITokenRepository>;

  const mockLogger: jest.Mocked<ILogger> = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<ILogger>;

  let verifyEmail: VerifyEmail;
  let mockEmitSpy: jest.SpyInstance;

  // Test data
  const userId = uuidv4();
  const tokenId = uuidv4();
  const tokenString = 'test-verification-token';
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7); // 7 days from now
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 1); // 1 day ago

  const mockUser: UserResponseDTO = {
    id: userId,
    email: 'test@example.com',
    name: 'User',
    username: 'test',
    role: UserRole.ADMIN,
    isVerified: false
  };

  const mockToken: TokenResponseDTO = {
    isExpired(): boolean {
      return false;
    },
    isValid(): boolean {
      return false;
    },
    id: tokenId,
    userId: userId,
    token: tokenString,
    type: TokenType.VERIFICATION,
    expiresAt: futureDate,
    isRevoked: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    verifyEmail = new VerifyEmail(mockUserRepository, mockTokenRepository, mockLogger);
    mockEmitSpy = jest.spyOn(verifyEmail as any, 'emitTyped');
  });

  describe('execute', () => {
    it('should verify user email successfully', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(mockToken);
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, isVerified: true });

      // Set up event handler to verify SUCCESS event
      const successHandler = jest.fn();
      verifyEmail.onTyped('SUCCESS', successHandler);

      // Act
      await verifyEmail.execute(tokenString);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(tokenString);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockUserRepository.update).toHaveBeenCalledWith(userId, { ...mockUser, isVerified: true });

      expect(mockEmitSpy).toHaveBeenCalledWith('SUCCESS', { userId });
      expect(successHandler).toHaveBeenCalledWith({ userId });

      expect(mockLogger.info).toHaveBeenCalledWith('User email successfully verified', { userId });
    });

    it('should emit TOKEN_NOT_FOUND when token is not found', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(undefined);

      // Set up event handler to verify TOKEN_NOT_FOUND event
      const notFoundHandler = jest.fn();
      verifyEmail.onTyped('TOKEN_NOT_FOUND', notFoundHandler);

      // Act
      await verifyEmail.execute(tokenString);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(tokenString);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(mockEmitSpy).toHaveBeenCalledWith('TOKEN_NOT_FOUND', 'Verification token not found');
      expect(notFoundHandler).toHaveBeenCalledWith('Verification token not found');

      expect(mockLogger.info).toHaveBeenCalledWith('Verification token not found', { token: tokenString });
    });

    it('should emit TOKEN_NOT_FOUND when token type is not VERIFICATION', async () => {
      // Arrange
      const resetToken = TokenResponseDTO.fromEntity({
        ...mockToken,
        type: TokenType.REFRESH,
        isExpired: mockToken.isExpired,
        isValid: mockToken.isValid
      });

      mockTokenRepository.findByToken.mockResolvedValue(resetToken);

      // Set up event handler to verify TOKEN_NOT_FOUND event
      const notFoundHandler = jest.fn();
      verifyEmail.onTyped('TOKEN_NOT_FOUND', notFoundHandler);

      // Act
      await verifyEmail.execute(tokenString);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(tokenString);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(mockEmitSpy).toHaveBeenCalledWith('TOKEN_NOT_FOUND', 'Invalid token for verification');
      expect(notFoundHandler).toHaveBeenCalledWith('Invalid token for verification');

      expect(mockLogger.info).toHaveBeenCalledWith('Invalid token type for verification', {
        tokenId: resetToken.id,
        type: resetToken.type
      });
    });

    it('should emit TOKEN_EXPIRED when token has expired', async () => {
      // Arrange
      const expiredToken = TokenResponseDTO.fromEntity({
        ...mockToken,
        expiresAt: pastDate,
        isExpired: mockToken.isExpired,
        isValid: mockToken.isValid
      });

      mockTokenRepository.findByToken.mockResolvedValue(expiredToken);

      // Set up event handler to verify TOKEN_EXPIRED event
      const expiredHandler = jest.fn();
      verifyEmail.onTyped('TOKEN_EXPIRED', expiredHandler);

      // Act
      await verifyEmail.execute(tokenString);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(tokenString);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(mockEmitSpy).toHaveBeenCalledWith('TOKEN_EXPIRED', 'Verification token has expired');
      expect(expiredHandler).toHaveBeenCalledWith('Verification token has expired');

      expect(mockLogger.info).toHaveBeenCalledWith('Verification token expired', {
        tokenId: expiredToken.id,
        userId: expiredToken.userId
      });
    });

    it('should emit USER_NOT_FOUND when user is not found', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(mockToken);
      mockUserRepository.findById.mockResolvedValue(undefined);

      // Set up event handler to verify USER_NOT_FOUND event
      const userNotFoundHandler = jest.fn();
      verifyEmail.onTyped('USER_NOT_FOUND', userNotFoundHandler);

      // Act
      await verifyEmail.execute(tokenString);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(tokenString);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(mockEmitSpy).toHaveBeenCalledWith('USER_NOT_FOUND', 'User not found for this verification token');
      expect(userNotFoundHandler).toHaveBeenCalledWith('User not found for this verification token');

      expect(mockLogger.info).toHaveBeenCalledWith('User not found for verification token', {
        tokenId: mockToken.id,
        userId: mockToken.userId
      });
    });

    it('should emit ALREADY_VERIFIED when user is already verified', async () => {
      // Arrange
      const verifiedUser = { ...mockUser, isVerified: true };
      mockTokenRepository.findByToken.mockResolvedValue(mockToken);
      mockUserRepository.findById.mockResolvedValue(verifiedUser);

      // Set up event handler to verify ALREADY_VERIFIED event
      const alreadyVerifiedHandler = jest.fn();
      verifyEmail.onTyped('ALREADY_VERIFIED', alreadyVerifiedHandler);

      // Act
      await verifyEmail.execute(tokenString);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(tokenString);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(mockEmitSpy).toHaveBeenCalledWith('ALREADY_VERIFIED', { userId: verifiedUser.id });
      expect(alreadyVerifiedHandler).toHaveBeenCalledWith({ userId: verifiedUser.id });

      expect(mockLogger.info).toHaveBeenCalledWith('User is already verified', { userId: verifiedUser.id });
    });

    it('should handle and emit errors appropriately', async () => {
      // Arrange
      const error = new Error('Database error');
      mockTokenRepository.findByToken.mockRejectedValue(error);

      // Set up event handler to verify ERROR event
      const errorHandler = jest.fn();
      verifyEmail.onTyped('ERROR', errorHandler);

      // Act
      await verifyEmail.execute(tokenString);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(tokenString);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(mockEmitSpy).toHaveBeenCalledWith('ERROR', error);
      expect(errorHandler).toHaveBeenCalledWith(error);

      expect(mockLogger.error).toHaveBeenCalledWith('Error verifying email', {
        error: 'Database error',
        token: tokenString
      });
    });
  });
});
