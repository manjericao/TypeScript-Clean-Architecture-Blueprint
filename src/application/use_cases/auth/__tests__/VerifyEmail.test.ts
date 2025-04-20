import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

// --- Interfaces and Types to Mock ---
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { OperationError } from '@application/use_cases/base';
import { TokenInputDTO } from '@enterprise/dto/input/token';
import { TokenType, UserRole } from '@enterprise/enum';

// --- Class Under Test ---
import { VerifyEmail } from '@application/use_cases/auth';
import { User, Token } from '@enterprise/entities';

// --- Helper Types/Interfaces for Mocks ---
interface MockTokenRecord extends Token {
  id: string;
}

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
  removeExpired: jest.fn(),
};

const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// --- Helper Functions ---

const createFakeVerifyData = (): TokenInputDTO => {
  const dto = new TokenInputDTO();
  dto.token = faker.string.alphanumeric(40); // Simulate a verification token
  return dto;
};

const createFakeTokenRecord = (
  userId: string,
  token: string,
  type: TokenType = TokenType.VERIFICATION, // Default to VERIFICATION
  expiresInMinutes: number = 15 // Default expiry
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
    isRevoked: false, // Assuming not relevant for basic verify, but good to include
    // Mocking entity methods - these won't be called by the use case directly
    isExpired: function (): boolean {
      return this.expiresAt.getTime() < Date.now();
    },
    isValid: function (): boolean {
      return !this.isExpired() && !this.isRevoked;
    },
  };
};

const createFakeUser = (isVerified: boolean = false, userId?: string): MockUser => ({
  id: userId || faker.string.uuid(),
  email: faker.internet.email(),
  username: faker.internet.username(),
  password: 'hashed_password', // Not directly used in VerifyEmail
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  isVerified: isVerified, // Crucial for this use case
  name: faker.person.fullName(),
  // Add other User properties if they exist in your entity
});

// --- Test Suite ---

describe('VerifyEmail Use Case', () => {
  let verifyEmail: VerifyEmail;
  let verifyData: TokenInputDTO;
  let fakeUser: MockUser;
  let fakeTokenRecord: MockTokenRecord;
  const fixedTime = new Date('2024-03-10T12:00:00.000Z'); // Example fixed time

  // Mock event handlers
  let onSuccess: jest.Mock;
  let onError: jest.Mock;
  let onTokenNotFound: jest.Mock;
  let onUserNotFound: jest.Mock;
  let onTokenExpired: jest.Mock;
  let onInvalidToken: jest.Mock; // Although code emits TOKEN_NOT_FOUND for wrong type
  let onAlreadyVerified: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();

    // Use fake timers to control Date.now() for expiry checks
    jest.useFakeTimers();
    jest.setSystemTime(fixedTime);

    // Instantiate the use case with mocks
    verifyEmail = new VerifyEmail(mockUserRepository, mockTokenRepository, mockLogger);

    // Initialize mock event handlers
    onSuccess = jest.fn();
    onError = jest.fn();
    onTokenNotFound = jest.fn();
    onUserNotFound = jest.fn();
    onTokenExpired = jest.fn();
    onInvalidToken = jest.fn(); // For tracking potential invalid token scenarios
    onAlreadyVerified = jest.fn();

    // Attach mock handlers to the use case instance
    verifyEmail.on('SUCCESS', onSuccess);
    verifyEmail.on('ERROR', onError);
    verifyEmail.on('TOKEN_NOT_FOUND', onTokenNotFound);
    verifyEmail.on('USER_NOT_FOUND', onUserNotFound);
    verifyEmail.on('TOKEN_EXPIRED', onTokenExpired);
    verifyEmail.on('INVALID_TOKEN', onInvalidToken); // Note: Code currently emits TOKEN_NOT_FOUND for invalid type
    verifyEmail.on('ALREADY_VERIFIED', onAlreadyVerified);

    // Prepare default fake data for the happy path
    verifyData = createFakeVerifyData();
    fakeUser = createFakeUser(false); // User is NOT verified initially
    // Create a token that is valid by default relative to fixedTime
    fakeTokenRecord = createFakeTokenRecord(
      fakeUser.id,
      verifyData.token,
      TokenType.VERIFICATION,
      15 // Expires 15 mins after fixedTime
    );
  });

  afterEach(() => {
    // Restore real timers after each test
    jest.useRealTimers();
  });

  // --- Test Cases ---

  describe('execute', () => {
    it('should emit SUCCESS when token is valid, not expired, user exists, user is not verified, and operations succeed', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
      mockUserRepository.findById.mockResolvedValue(fakeUser);
      mockUserRepository.update.mockResolvedValue(fakeUser);
      mockTokenRepository.delete.mockResolvedValue(undefined);

      const expectedSuccessPayload = { userId: fakeUser.id };

      // Act
      await verifyEmail.execute(verifyData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith(verifyData.token);
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeTokenRecord.userId);
      expect(mockUserRepository.update).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.update).toHaveBeenCalledWith(fakeUser.id, { isVerified: true });
      expect(mockTokenRepository.delete).toHaveBeenCalledTimes(1);
      expect(mockTokenRepository.delete).toHaveBeenCalledWith(fakeTokenRecord.id);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(expectedSuccessPayload);
      expect(onError).not.toHaveBeenCalled();
      expect(onTokenNotFound).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();
      expect(onAlreadyVerified).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('VerifyEmail operation started'),
        expect.any(Object)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Attempting to find verification token.');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Found token record.',
        expect.objectContaining({ tokenId: fakeTokenRecord.id })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to find user associated with token'),
        expect.any(String) // userId is part of the string here
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Found user.',
        expect.objectContaining({ userId: fakeUser.id, isVerified: false })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Updating user verification status.',
        expect.objectContaining({ userId: fakeUser.id })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'User verification status updated successfully.',
        expect.objectContaining({ userId: fakeUser.id })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Deleting used verification token.',
        expect.objectContaining({ tokenId: fakeTokenRecord.id })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Verification token deleted successfully.',
        expect.objectContaining({ tokenId: fakeTokenRecord.id })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('VerifyEmail succeeded'),
        expect.objectContaining({ userId: fakeUser.id })
      );
    });

    it('should emit TOKEN_NOT_FOUND when tokenRepository.findByToken returns null', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(undefined);
      const expectedMessage = 'Invalid or expired verification link.';

      // Act
      await verifyEmail.execute(verifyData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(mockTokenRepository.delete).not.toHaveBeenCalled();

      expect(onTokenNotFound).toHaveBeenCalledTimes(1);
      expect(onTokenNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();
      expect(onAlreadyVerified).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledWith('Verification failed: Token not found.');
    });

    // Note: The code emits TOKEN_NOT_FOUND for invalid type, not INVALID_TOKEN
    it('should emit TOKEN_NOT_FOUND when the found token type is not VERIFICATION', async () => {
      // Arrange
      const wrongTypeToken = createFakeTokenRecord(
        fakeUser.id,
        verifyData.token,
        TokenType.RESET_PASSWORD // Use a different type
      );
      mockTokenRepository.findByToken.mockResolvedValue(wrongTypeToken);
      const expectedMessage = 'Invalid or expired verification link.';

      // Act
      await verifyEmail.execute(verifyData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(mockTokenRepository.delete).not.toHaveBeenCalled();

      // Check the event actually emitted by the code
      expect(onTokenNotFound).toHaveBeenCalledTimes(1);
      expect(onTokenNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onInvalidToken).not.toHaveBeenCalled(); // Should not be called based on current code
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();
      expect(onAlreadyVerified).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid token type provided'),
        expect.objectContaining({ tokenId: wrongTypeToken.id })
      );
    });

    it('should emit TOKEN_EXPIRED when the token expiration date is in the past and delete the token', async () => {
      // Arrange
      const expiredToken = createFakeTokenRecord(
        fakeUser.id,
        verifyData.token,
        TokenType.VERIFICATION,
        -5 // Expired 5 mins ago
      );
      mockTokenRepository.findByToken.mockResolvedValue(expiredToken);
      mockTokenRepository.delete.mockResolvedValue(undefined); // Expect delete to be called
      const expectedMessage = 'Verification link has expired. Please request a new one.';

      // Act
      await verifyEmail.execute(verifyData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(mockTokenRepository.delete).toHaveBeenCalledTimes(1); // Verify expired token is deleted
      expect(mockTokenRepository.delete).toHaveBeenCalledWith(expiredToken.id);

      expect(onTokenExpired).toHaveBeenCalledTimes(1);
      expect(onTokenExpired).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onTokenNotFound).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();
      expect(onAlreadyVerified).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Verification failed: Token expired.',
        expect.objectContaining({ tokenId: expiredToken.id })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Deleted expired verification token.',
        expect.objectContaining({ tokenId: expiredToken.id })
      );
    });

    it('should emit USER_NOT_FOUND when userRepository.findById returns null and delete the token', async () => {
      // Arrange
      mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
      mockUserRepository.findById.mockResolvedValue(undefined); // Simulate user not found
      mockTokenRepository.delete.mockResolvedValue(undefined); // Expect delete for orphaned token
      const expectedMessage = 'Invalid or expired verification link.';

      // Act
      await verifyEmail.execute(verifyData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeTokenRecord.userId);
      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(mockTokenRepository.delete).toHaveBeenCalledTimes(1); // Verify orphaned token is deleted
      expect(mockTokenRepository.delete).toHaveBeenCalledWith(fakeTokenRecord.id);

      expect(onUserNotFound).toHaveBeenCalledTimes(1);
      expect(onUserNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onTokenNotFound).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();
      expect(onAlreadyVerified).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Verification failed: User not found for token.',
        expect.objectContaining({ userId: fakeTokenRecord.userId, tokenId: fakeTokenRecord.id })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Deleted orphaned verification token.',
        expect.objectContaining({ tokenId: fakeTokenRecord.id })
      );
    });

    it('should emit ALREADY_VERIFIED when the user is already verified and delete the token', async () => {
      // Arrange
      const verifiedUser = createFakeUser(true, fakeTokenRecord.userId); // User IS verified
      mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
      mockUserRepository.findById.mockResolvedValue(verifiedUser);
      mockTokenRepository.delete.mockResolvedValue(undefined); // Expect delete for redundant token
      const expectedPayload = { userId: verifiedUser.id };

      // Act
      await verifyEmail.execute(verifyData);

      // Assert
      expect(mockTokenRepository.findByToken).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeTokenRecord.userId);
      expect(mockUserRepository.update).not.toHaveBeenCalled(); // Should not update if already verified
      expect(mockTokenRepository.delete).toHaveBeenCalledTimes(1); // Verify redundant token is deleted
      expect(mockTokenRepository.delete).toHaveBeenCalledWith(fakeTokenRecord.id);

      expect(onAlreadyVerified).toHaveBeenCalledTimes(1);
      expect(onAlreadyVerified).toHaveBeenCalledWith(expectedPayload);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onTokenNotFound).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onTokenExpired).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Verification skipped: User is already verified.',
        expect.objectContaining({ userId: verifiedUser.id })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Deleted redundant verification token for already verified user.',
        expect.objectContaining({ tokenId: fakeTokenRecord.id })
      );
    });

    // Test Error scenarios for each awaited operation
    it.each([
      {
        method: 'findByToken',
        repo: mockTokenRepository,
        errorCode: 'EMAIL_VERIFICATION_FAILED',
        setupMocks: () => {},
      },
      {
        method: 'delete',
        repo: mockTokenRepository,
        errorCode: 'EMAIL_VERIFICATION_FAILED',
        setupMocks: () => {
          // Setup to fail during expired token deletion
          const expiredToken = createFakeTokenRecord(
            fakeUser.id,
            verifyData.token,
            TokenType.VERIFICATION,
            -5
          );
          mockTokenRepository.findByToken.mockResolvedValue(expiredToken);
        },
      },
      {
        method: 'findById',
        repo: mockUserRepository,
        errorCode: 'EMAIL_VERIFICATION_FAILED',
        setupMocks: () => {
          mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
        },
      },
      {
        method: 'delete',
        repo: mockTokenRepository,
        errorCode: 'EMAIL_VERIFICATION_FAILED',
        setupMocks: () => {
          // Setup to fail during orphaned token deletion
          mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
          mockUserRepository.findById.mockResolvedValue(undefined);
        },
        testNameSuffix: 'after user not found', // Differentiate delete failures
      },
      {
        method: 'delete',
        repo: mockTokenRepository,
        errorCode: 'EMAIL_VERIFICATION_FAILED',
        setupMocks: () => {
          // Setup to fail during already verified token deletion
          const verifiedUser = createFakeUser(true, fakeTokenRecord.userId);
          mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
          mockUserRepository.findById.mockResolvedValue(verifiedUser);
        },
        testNameSuffix: 'after already verified', // Differentiate delete failures
      },
      {
        method: 'update',
        repo: mockUserRepository,
        errorCode: 'EMAIL_VERIFICATION_FAILED',
        setupMocks: () => {
          mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
          mockUserRepository.findById.mockResolvedValue(fakeUser); // Unverified user
        },
      },
      {
        method: 'delete',
        repo: mockTokenRepository,
        errorCode: 'EMAIL_VERIFICATION_FAILED',
        setupMocks: () => {
          // Setup to fail during final token deletion (success path)
          mockTokenRepository.findByToken.mockResolvedValue(fakeTokenRecord);
          mockUserRepository.findById.mockResolvedValue(fakeUser);
          mockUserRepository.update.mockResolvedValue(fakeUser);
        },
        testNameSuffix: 'after successful verification', // Differentiate delete failures
      },
    ])(
      'should emit ERROR when $repo.$method throws an error $testNameSuffix',
      async ({ method, repo, errorCode, setupMocks }) => {
        // Arrange
        const errorMessage = `Database error during ${method}`;
        const dbError = new Error(errorMessage);

        // Setup mocks specific to this error case
        setupMocks();

        // Make the specific method reject
        (repo[method as keyof typeof repo] as any).mockRejectedValue(dbError);

        // Act
        await verifyEmail.execute(verifyData);

        // Assert
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(expect.any(OperationError));

        const emittedError = onError.mock.calls[0][0] as OperationError;
        expect(emittedError.code).toBe(errorCode);
        expect(emittedError.message).toContain('Failed to process email verification request');
        expect(emittedError.message).toContain(errorMessage);
        expect(emittedError.details).toBe(dbError); // Check the original error is attached

        expect(onSuccess).not.toHaveBeenCalled();
        expect(onTokenNotFound).not.toHaveBeenCalled();
        expect(onUserNotFound).not.toHaveBeenCalled();
        expect(onTokenExpired).not.toHaveBeenCalled();
        expect(onInvalidToken).not.toHaveBeenCalled();
        expect(onAlreadyVerified).not.toHaveBeenCalled();

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
      }
    );
  });
});
