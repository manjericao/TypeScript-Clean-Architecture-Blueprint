import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

// --- Interfaces and Types to Mock ---
import { IUserRepository } from '@application/contracts/domain/repositories';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IJWTTokenGenerator } from '@application/contracts/security/authentication';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { OperationError } from '@application/use_cases/base';
import { AuthenticateUserDTO } from '@enterprise/dto/input/auth';
import { UserRole, TokenType } from '@enterprise/enum';

// --- Class Under Test ---
import { LoginUser } from '@application/use_cases/auth';

// --- Helper Types/Interfaces for Mocks ---
// Define a structure for the user object returned by findByEmailWithPassword
interface UserWithPassword {
  id: string;
  email: string;
  password: string; // Hashed password
  role: UserRole;
  isVerified: boolean;
  // Add other user fields if necessary, though LoginUser doesn't use them directly
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

const mockPasswordHasher: jest.Mocked<IPasswordHasher> = {
  hashPassword: jest.fn(),
  comparePasswords: jest.fn(),
};

const mockTokenGenerator: jest.Mocked<IJWTTokenGenerator> = {
  generateJWTToken: jest.fn(),
  validateJWTToken: jest.fn(), // Add other methods if they exist on the interface
};

// Mock IConfig with JWT settings
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
  debug: jest.fn(),
};

// --- Helper Functions ---

const createFakeCredentials = (): AuthenticateUserDTO => ({
  email: faker.internet.email(),
  password: faker.internet.password(),
});

const createFakeUserWithPassword = (
  credentials: AuthenticateUserDTO,
  isVerified: boolean = true
): UserWithPassword => ({
  id: faker.string.uuid(),
  email: credentials.email,
  password: `hashed_${credentials.password}`, // Simulate a hashed password
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  isVerified: isVerified,
});

// --- Test Suite ---

describe('LoginUser Use Case', () => {
  let loginUser: LoginUser;
  let credentials: AuthenticateUserDTO;
  let fakeUser: UserWithPassword;
  const fakeAccessToken = 'fake.access.token';
  const fakeRefreshToken = 'fake.refresh.token';
  const fixedDate = new Date('2024-01-01T12:00:00.000Z'); // For predictable token expiry

  // Mock event handlers
  let onSuccess: jest.Mock;
  let onError: jest.Mock;
  let onUserNotFound: jest.Mock;
  let onInvalidCredentials: jest.Mock;
  let onAccountNotVerified: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();

    // Use fake timers to control Date.now() for token expiration
    jest.useFakeTimers();
    jest.setSystemTime(fixedDate);

    // Instantiate the use case with mocks
    loginUser = new LoginUser(
      mockUserRepository,
      mockPasswordHasher,
      mockTokenGenerator,
      mockConfig,
      mockLogger
    );

    // Initialize mock event handlers
    onSuccess = jest.fn();
    onError = jest.fn();
    onUserNotFound = jest.fn();
    onInvalidCredentials = jest.fn();
    onAccountNotVerified = jest.fn();

    // Attach mock handlers to the use case instance
    loginUser.on('SUCCESS', onSuccess);
    loginUser.on('ERROR', onError);
    loginUser.on('USER_NOT_FOUND', onUserNotFound);
    loginUser.on('INVALID_CREDENTIALS', onInvalidCredentials);
    loginUser.on('ACCOUNT_NOT_VERIFIED', onAccountNotVerified);

    // Prepare default fake data
    credentials = createFakeCredentials();
    fakeUser = createFakeUserWithPassword(credentials, true); // Assume verified by default
  });

  afterEach(() => {
    // Restore real timers after each test
    jest.useRealTimers();
  });

  // --- Test Cases ---

  describe('execute', () => {
    it('should emit SUCCESS with tokens when credentials are valid and user is verified', async () => {
      // Arrange
      mockUserRepository.findByEmailWithPassword.mockResolvedValue(fakeUser);
      mockPasswordHasher.comparePasswords.mockResolvedValue(true);
      mockTokenGenerator.generateJWTToken
        .mockReturnValueOnce(fakeAccessToken) // The First call is for an access token
        .mockReturnValueOnce(fakeRefreshToken); // The Second call is for a refresh token

      const expectedAccessTokenExpires = new Date(
        fixedDate.getTime() + mockConfig.jwt.accessExpirationMinutes * 60 * 1000
      );
      const expectedRefreshTokenExpires = new Date(
        fixedDate.getTime() + mockConfig.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000
      );

      const expectedSuccessPayload = {
        userId: fakeUser.id,
        accessToken: fakeAccessToken,
        accessTokenExpires: expectedAccessTokenExpires,
        refreshToken: fakeRefreshToken,
        refreshTokenExpires: expectedRefreshTokenExpires,
      };

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledWith(credentials.email);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledWith(
        credentials.password,
        fakeUser.password
      );
      expect(mockTokenGenerator.generateJWTToken).toHaveBeenCalledTimes(2);
      // Access Token Call
      expect(mockTokenGenerator.generateJWTToken).toHaveBeenNthCalledWith(
        1,
        { userId: fakeUser.id, email: fakeUser.email, role: fakeUser.role },
        TokenType.ACCESS,
        mockConfig.jwt.accessExpirationMinutes
      );
      // Refresh Token Call
      expect(mockTokenGenerator.generateJWTToken).toHaveBeenNthCalledWith(
        2,
        { userId: fakeUser.id }, // Payload defined in LoginUser
        TokenType.REFRESH,
        mockConfig.jwt.refreshExpirationDays * 24 * 60 // Conversion to minutes
      );

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(expectedSuccessPayload);
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onInvalidCredentials).not.toHaveBeenCalled();
      expect(onAccountNotVerified).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('LoginUser operation started'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Attempting to find user by email'),);
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Comparing password for user'),);
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Generating tokens for user'),);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('LoginUser succeeded'), expect.any(Object));
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should emit USER_NOT_FOUND when user with given email does not exist', async () => {
      // Arrange
      mockUserRepository.findByEmailWithPassword.mockResolvedValue(undefined); // Simulate user not found
      const expectedMessage = `Authentication failed: No user found with email ${credentials.email}`;

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledWith(credentials.email);
      expect(mockPasswordHasher.comparePasswords).not.toHaveBeenCalled();
      expect(mockTokenGenerator.generateJWTToken).not.toHaveBeenCalled();

      expect(onUserNotFound).toHaveBeenCalledTimes(1);
      expect(onUserNotFound).toHaveBeenCalledWith(expectedMessage); // Check the specific message from the use case
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onInvalidCredentials).not.toHaveBeenCalled();
      expect(onAccountNotVerified).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expectedMessage);
    });

    it('should emit INVALID_CREDENTIALS when password comparison fails', async () => {
      // Arrange
      mockUserRepository.findByEmailWithPassword.mockResolvedValue(fakeUser);
      mockPasswordHasher.comparePasswords.mockResolvedValue(false); // Simulate wrong password
      const expectedMessageToUser = 'Invalid email or password.'; // Generic message emitted to a user
      const expectedLogMessage = `Authentication failed: Invalid credentials provided for email ${credentials.email}`;

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledWith(credentials.password, fakeUser.password);
      expect(mockTokenGenerator.generateJWTToken).not.toHaveBeenCalled();

      expect(onInvalidCredentials).toHaveBeenCalledTimes(1);
      expect(onInvalidCredentials).toHaveBeenCalledWith(expectedMessageToUser);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onAccountNotVerified).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expectedLogMessage); // Check the internal log message
    });

    it('should emit ACCOUNT_NOT_VERIFIED when user is found but account is not verified', async () => {
      // Arrange
      const unverifiedUser = createFakeUserWithPassword(credentials, false); // User exists but is not verified
      mockUserRepository.findByEmailWithPassword.mockResolvedValue(unverifiedUser);
      mockPasswordHasher.comparePasswords.mockResolvedValue(true); // The Password is correct
      const expectedMessageToUser = 'Please verify your email before logging in.';
      const expectedLogMessage = `Authentication failed: Account not verified for email ${credentials.email}`;


      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledTimes(1);
      expect(mockTokenGenerator.generateJWTToken).not.toHaveBeenCalled();

      expect(onAccountNotVerified).toHaveBeenCalledTimes(1);
      expect(onAccountNotVerified).toHaveBeenCalledWith(expectedMessageToUser);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onInvalidCredentials).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expectedLogMessage); // Check the internal log message
    });

    it('should emit ERROR when repository throws an unexpected error', async () => {
      // Arrange
      const repositoryError = new Error('Database connection lost');
      mockUserRepository.findByEmailWithPassword.mockRejectedValue(repositoryError);

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.comparePasswords).not.toHaveBeenCalled();
      expect(mockTokenGenerator.generateJWTToken).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError)); // Check if it's an OperationError instance
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'LOGIN_FAILED',
          message: expect.stringContaining(`Failed to process login request for ${credentials.email}: ${repositoryError.message}`),
          cause: repositoryError,
        })
      );
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onInvalidCredentials).not.toHaveBeenCalled();
      expect(onAccountNotVerified).not.toHaveBeenCalled();

      // BaseOperation's emitError handles logging, so check logger.error via that if needed,
      // but the primary check is that the ERROR event was emitted correctly.
      // Expect logger.error to have been called by the base class's emitError method
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should emit ERROR when password comparison throws an unexpected error', async () => {
      // Arrange
      const hasherError = new Error('Hashing algorithm unavailable');
      mockUserRepository.findByEmailWithPassword.mockResolvedValue(fakeUser);
      mockPasswordHasher.comparePasswords.mockRejectedValue(hasherError);

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledTimes(1);
      expect(mockTokenGenerator.generateJWTToken).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'LOGIN_FAILED',
          message: expect.stringContaining(`Failed to process login request for ${credentials.email}: ${hasherError.message}`),
          cause: hasherError,
        })
      );
      expect(onSuccess).not.toHaveBeenCalled();
      // ... other event handlers not called ...
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should emit ERROR when token generation throws an unexpected error', async () => {
      // Arrange
      const tokenError = new Error('Token signing failed');
      mockUserRepository.findByEmailWithPassword.mockResolvedValue(fakeUser);
      mockPasswordHasher.comparePasswords.mockResolvedValue(true);
      mockTokenGenerator.generateJWTToken.mockImplementation(() => { // Use mockImplementation to throw an error
        throw tokenError;
      });

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledTimes(1);
      expect(mockTokenGenerator.generateJWTToken).toHaveBeenCalledTimes(1);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'LOGIN_FAILED',
          message: expect.stringContaining(`Failed to process login request for ${credentials.email}: ${tokenError.message}`),
          cause: tokenError,
        })
      );
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
