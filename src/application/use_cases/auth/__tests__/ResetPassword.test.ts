import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

// --- Interfaces and Types to Mock ---
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { OperationError } from '@application/use_cases/base';
import { ResetPasswordDTO } from '@enterprise/dto/input/auth';
import { TokenType, UserRole } from '@enterprise/enum';

// --- Class Under Test ---
import { ResetPassword } from '@application/use_cases/auth';
import { User, Token } from '@enterprise/entities';

// --- Helper Types/Interfaces for Mocks ---
// Define a structure for the token object returned by findByToken
interface MockTokenRecord extends Token {
  id: string;
}

// Define a structure for the user object returned by findById
interface MockUser extends User {
  id: string;
}


// --- Mocks ---

const mockUserRepository: jest.Mocked<IUserRepository> = {
  findAll: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockTokenRepository: jest.Mocked<ITokenRepository> = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findByToken: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  revoke: jest.fn(),
  removeExpired: jest.fn()
};

const mockPasswordHasher: jest.Mocked<IPasswordHasher> = {
  hashPassword: jest.fn(),
  comparePasswords: jest.fn(), // Add other methods if they exist
};

const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// --- Helper Functions ---

const createFakeResetData = (): ResetPasswordDTO => ({
  token: faker.string.alphanumeric(40), // Simulate a reset token
  newPassword: faker.internet.password({ length: 12 }),
});

const createFakeTokenRecord = (
  userId: string,
  token: string,
  type: TokenType = TokenType.RESET_PASSWORD,
  expiresInMinutes: number = 10
): MockTokenRecord => {
  const now = new Date();
  return {
    id: faker.string.uuid(),
    userId: userId,
    token: token,
    type: type,
    expiresAt: new Date(now.getTime() + expiresInMinutes * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    isRevoked: false,
    isExpired: function(): boolean {
      throw new Error('Function not implemented.');
    },
    isValid: function(): boolean {
      throw new Error('Function not implemented.');
    }
  };
};

const createFakeUser = (userId?: string): MockUser => ({
  id: userId || faker.string.uuid(),
  email: faker.internet.email(),
  username: faker.internet.username(),
  password: 'hashed_password',
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  isVerified: true,
  name: faker.person.fullName()
});


// --- Test Suite ---

describe('ResetPassword Use Case', () => {
  let resetPassword: ResetPassword;
  let resetData: ResetPasswordDTO;
  let fakeUser: MockUser;
  let fakeTokenRecord: MockTokenRecord;
  let hashedPassword = 'new_hashed_password';
  const fixedTime = new Date('2024-02-15T10:00:00.000Z');

  // Mock event handlers
  let onSuccess: jest.Mock;
  let onError: jest.Mock;
  let onTokenNotFound: jest.Mock;
  let onTokenExpired: jest.Mock;
  let onInvalidToken: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();

    // Use fake timers to control Date.now() for expiry checks
    jest.useFakeTimers();
    jest.setSystemTime(fixedTime);


    // Instantiate the use case with mocks
    resetPassword = new ResetPassword(
      mockUserRepository,
      mockTokenRepository,
      mockPasswordHasher,
      mockLogger
    );

    // Initialize mock event handlers
    onSuccess = jest.fn();
    onError = jest.fn();
    onTokenNotFound = jest.fn();
    onTokenExpired = jest.fn();
    onInvalidToken = jest.fn();

    // Attach mock handlers to the use case instance
    resetPassword.on('SUCCESS', onSuccess);
    resetPassword.on('ERROR', onError);
    resetPassword.on('TOKEN_NOT_FOUND', onTokenNotFound);
    resetPassword.on('TOKEN_EXPIRED', onTokenExpired);
    resetPassword.on('INVALID_TOKEN', onInvalidToken);

    // Prepare default fake data
    resetData = createFakeResetData();
    fakeUser = createFakeUser();
    // Create a token that is valid by default relative to fixedTime
    fakeTokenRecord = createFakeTokenRecord(fakeUser.id, resetData.token, TokenType.RESET_PASSWORD, 10); // Expires 10 mins after fixedTime
  });

  afterEach(() => {
    // Restore real timers after each test
    jest.useRealTimers();
  });

  // --- Test Cases ---

  describe('execute', () => {
    it('should emit SUCCESS when token is valid, not expired, user exists, and operations succeed', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
      mockUserRepository.findById.mockResolvedValue(fakeUser);
      mockPasswordHasher.hashPassword.mockResolvedValue(hashedPassword);
      mockUserRepository.update.mockResolvedValue(fakeUser);
      mockTokenRepository.delete.mockResolvedValue(undefined);

      const expectedSuccessPayload = {
        message: 'Password has been reset successfully.',
        userId: fakeUser.id,
      };

      // Act
      await resetPassword.execute(resetData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(resetData.token);
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeTokenRecord.userId);
      expect(mockPasswordHasher.hashPassword).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.hashPassword).toHaveBeenCalledWith(resetData.newPassword);
      expect(mockUserRepository.update).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.update).toHaveBeenCalledWith(fakeUser.id, { password: hashedPassword });
      expect(mockTokenRepository.delete).toHaveBeenCalledTimes(1);
      expect(mockTokenRepository.delete).toHaveBeenCalledWith(fakeTokenRecord.id);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(expectedSuccessPayload);
      expect(onError).not.toHaveBeenCalled();
      expect(onTokenNotFound).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ResetPassword operation started'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith('Attempting to find reset token record.');
      expect(mockLogger.debug).toHaveBeenCalledWith('Found token record.', expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Attempting to find user associated with token'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Hashing new password for user'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Updating user password in repository'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Deleting used reset token'), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ResetPassword succeeded'), expect.any(Object));
    });

    it('should emit TOKEN_NOT_FOUND when tokenRepository.findByToken returns null', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(undefined);
      const expectedMessage = 'Invalid or expired password reset link.';

      // Act
      await resetPassword.execute(resetData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockPasswordHasher.hashPassword).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(mockTokenRepository.delete).not.toHaveBeenCalled();

      expect(onTokenNotFound).toHaveBeenCalledTimes(1);
      expect(onTokenNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledWith('Password reset failed: Token not found in repository.');
    });

    it('should emit INVALID_TOKEN when the found token type is not RESET_PASSWORD', async () => {
      // Arrange
      const wrongTypeToken = createFakeTokenRecord(fakeUser.id, resetData.token, TokenType.ACCESS); // Use ACCESS token type
      mockTokenRepository.findByToken.mockResolvedValue(wrongTypeToken);
      const expectedMessage = 'Invalid password reset link.';

      // Act
      await resetPassword.execute(resetData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();

      expect(onInvalidToken).toHaveBeenCalledTimes(1);
      expect(onInvalidToken).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onTokenNotFound).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid token type'), expect.any(Object));
    });

    it('should emit TOKEN_EXPIRED when the token expiration date is in the past', async () => {
      // Arrange
      const expiredToken = createFakeTokenRecord(fakeUser.id, resetData.token, TokenType.RESET_PASSWORD, -5); // Expired 5 mins ago
      mockTokenRepository.findByToken.mockResolvedValue(expiredToken);
      // The use case also deletes the expired token
      mockTokenRepository.delete.mockResolvedValue(undefined);
      const expectedMessage = 'Password reset link has expired. Please request a new one.';

      // Act
      await resetPassword.execute(resetData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockTokenRepository.delete).toHaveBeenCalledTimes(1); // Verify expired token is deleted
      expect(mockTokenRepository.delete).toHaveBeenCalledWith(expiredToken.id);


      expect(onTokenExpired).toHaveBeenCalledTimes(1);
      expect(onTokenExpired).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onTokenNotFound).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledWith('Password reset failed: Token expired.', expect.any(Object));
    });

    it('should emit INVALID_TOKEN when userRepository.findById returns null', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
      mockUserRepository.findById.mockResolvedValue(undefined); // Simulate user not found for a valid token
      const expectedMessage = 'Invalid password reset link.';

      // Act
      await resetPassword.execute(resetData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeTokenRecord.userId);
      expect(mockPasswordHasher.hashPassword).not.toHaveBeenCalled();

      expect(onInvalidToken).toHaveBeenCalledTimes(1);
      expect(onInvalidToken).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onTokenNotFound).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledWith('Password reset failed: User associated with token not found.', expect.any(Object));
    });

    // Test Error scenarios for each awaited operation
    it.each([
      { method: 'findByToken', repo: mockTokenRepository, errorCode: 'RESET_PASSWORD_FAILED' },
      { method: 'findById', repo: mockUserRepository, errorCode: 'RESET_PASSWORD_FAILED' },
      { method: 'hashPassword', repo: mockPasswordHasher, errorCode: 'RESET_PASSWORD_FAILED' },
      { method: 'update', repo: mockUserRepository, errorCode: 'RESET_PASSWORD_FAILED' },
      { method: 'delete', repo: mockTokenRepository, errorCode: 'RESET_PASSWORD_FAILED' },
    ])('should emit ERROR when $repo.$method throws an error', async ({ method, repo, errorCode }) => {
      // Arrange
      const errorMessage = `Database error during ${method}`;
      const dbError = new Error(errorMessage);

      // Setup mocks to reach the failing point
      mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
      if (method !== 'findByToken') {
        mockUserRepository.findById.mockResolvedValue(fakeUser);
      }
      if (method !== 'findByToken' && method !== 'findById') {
        mockPasswordHasher.hashPassword.mockResolvedValue(hashedPassword);
      }
      if (method !== 'findByToken' && method !== 'findById' && method !== 'hashPassword') {
        mockUserRepository.update.mockResolvedValue(fakeUser);
      }
      // Make the specific method reject
      (repo[method as keyof typeof repo] as any).mockRejectedValue(dbError);

      // Act
      await resetPassword.execute(resetData);

      // Assert
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));

      const emittedError = onError.mock.calls[0][0] as OperationError;
      expect(emittedError.code).toBe(errorCode);
      expect(emittedError.message).toContain('Failed to process password reset request');
      expect(emittedError.message).toContain(errorMessage);
      expect(emittedError.details).toBe(dbError);

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onTokenNotFound).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();

      // BaseOperation's emitError handles logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Operation ${errorCode} failed`),
        expect.objectContaining({
          errorCode: errorCode,
          errorMessage: emittedError.message,
          errorStack: expect.any(String),
          errorCause: dbError,
        })
      );
    });
  });
});
