import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

// --- Interfaces and Types to Mock ---
import { ITokenBlackList } from '@application/contracts/security/authentication';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { OperationError } from '@application/use_cases/base';
import { LogoutRequestDTO } from '@enterprise/dto/input/auth';

// --- Class Under Test ---
import { LogoutUser } from '@application/use_cases/auth';

// --- Mocks ---

const mockTokenBlackList: jest.Mocked<ITokenBlackList> = {
  addToBlackList: jest.fn(),
  isBlackListed: jest.fn(), // Assuming this might exist, add other methods if needed
};

// Mock IConfig with relevant JWT settings
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

const createFakeLogoutData = (): LogoutRequestDTO => ({
  accessToken: faker.string.alphanumeric(50), // Generate fake JWT-like strings
  refreshToken: faker.string.alphanumeric(50),
});

// --- Test Suite ---

describe('LogoutUser Use Case', () => {
  let logoutUser: LogoutUser;
  let logoutData: LogoutRequestDTO;

  // Mock event handlers
  let onSuccess: jest.Mock;
  let onError: jest.Mock;
  let onInvalidToken: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();

    // Instantiate the use case with mocks
    logoutUser = new LogoutUser(mockTokenBlackList, mockConfig, mockLogger);

    // Initialize mock event handlers
    onSuccess = jest.fn();
    onError = jest.fn();
    onInvalidToken = jest.fn();

    // Attach mock handlers to the use case instance
    logoutUser.on('SUCCESS', onSuccess);
    logoutUser.on('ERROR', onError);
    logoutUser.on('INVALID_TOKEN', onInvalidToken);

    // Prepare default fake data
    logoutData = createFakeLogoutData();
  });

  // afterEach can be used for cleanup if needed, e.g., jest.useRealTimers() if timers were faked

  // --- Test Cases ---

  describe('execute', () => {
    it('should emit SUCCESS when valid tokens are provided and blacklisting succeeds', async () => {
      // Arrange
      mockTokenBlackList.addToBlackList.mockResolvedValue(undefined); // Simulate successful blacklisting

      const expectedSuccessPayload = {
        message: 'Successfully logged out.',
      };
      const expectedAccessTokenExpirySeconds = mockConfig.jwt.accessExpirationMinutes * 60;
      const expectedRefreshTokenExpirySeconds = mockConfig.jwt.refreshExpirationDays * 24 * 60 * 60;

      // Act
      await logoutUser.execute(logoutData);

      // Assert
      expect(mockTokenBlackList.addToBlackList).toHaveBeenCalledTimes(2);
      expect(mockTokenBlackList.addToBlackList).toHaveBeenCalledWith(
        logoutData.accessToken,
        expectedAccessTokenExpirySeconds
      );
      expect(mockTokenBlackList.addToBlackList).toHaveBeenCalledWith(
        logoutData.refreshToken,
        expectedRefreshTokenExpirySeconds
      );

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(expectedSuccessPayload);
      expect(onError).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'LogoutUser operation started.',
        expect.any(Object)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Attempting to add tokens to blacklist.', expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith('LogoutUser succeeded: Tokens blacklisted successfully.');
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should emit INVALID_TOKEN when access token is missing', async () => {
      // Arrange
      logoutData.accessToken = ''; // Simulate missing token
      const expectedMessage = 'Invalid or missing tokens provided.';
      const expectedLogMessage = 'Logout failed: Access token or refresh token is missing.';

      // Act
      await logoutUser.execute(logoutData);

      // Assert
      expect(mockTokenBlackList.addToBlackList).not.toHaveBeenCalled();

      expect(onInvalidToken).toHaveBeenCalledTimes(1);
      expect(onInvalidToken).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expectedLogMessage);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'LogoutUser operation started.',
        expect.objectContaining({ hasAccessToken: false })
      );
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should emit INVALID_TOKEN when refresh token is missing', async () => {
      // Arrange
      logoutData.refreshToken = ''; // Simulate missing token
      const expectedMessage = 'Invalid or missing tokens provided.';
      const expectedLogMessage = 'Logout failed: Access token or refresh token is missing.';

      // Act
      await logoutUser.execute(logoutData);

      // Assert
      expect(mockTokenBlackList.addToBlackList).not.toHaveBeenCalled();

      expect(onInvalidToken).toHaveBeenCalledTimes(1);
      expect(onInvalidToken).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expectedLogMessage);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'LogoutUser operation started.',
        expect.objectContaining({ hasRefreshToken: false })
      );
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should emit INVALID_TOKEN when both tokens are null', async () => {
      // Arrange
      const nullTokenData: LogoutRequestDTO = { accessToken: null as any, refreshToken: null as any }; // Edge case: null input
      const expectedMessage = 'Invalid or missing tokens provided.';
      const expectedLogMessage = 'Logout failed: Access token or refresh token is missing.';

      // Act
      await logoutUser.execute(nullTokenData);

      // Assert
      expect(mockTokenBlackList.addToBlackList).not.toHaveBeenCalled();
      expect(onInvalidToken).toHaveBeenCalledTimes(1);
      expect(onInvalidToken).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expectedLogMessage);
    });

    it('should emit ERROR when tokenBlackList.addToBlackList rejects', async () => {
      // Arrange
      const blacklistError = new Error('Redis connection failed');
      mockTokenBlackList.addToBlackList.mockRejectedValue(blacklistError); // Simulate error during blacklisting

      // Act
      await logoutUser.execute(logoutData);

      // Assert
      expect(mockTokenBlackList.addToBlackList).toHaveBeenCalledTimes(2); // Promise.all rejects on the first error

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError)); // Check if it's an OperationError instance

      // --- Fixes Applied Below ---
      // Use type assertion 'as' to inform TypeScript about the expected type
      const emittedError = onError.mock.calls[0][0] as OperationError;

      // Assert on the properties of the OperationError
      expect(emittedError).toBeInstanceOf(OperationError); // Keep this check for runtime safety
      expect(emittedError.code).toBe('LOGOUT_FAILED');
      expect(emittedError.message).toContain('Failed to process logout request');
      expect(emittedError.message).toContain(blacklistError.message);
      // Check the 'cause' property for the original error
      expect(emittedError.details).toBe(blacklistError);
      // --- End of Fixes ---

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onInvalidToken).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledTimes(1); // Only the initial start log
      expect(mockLogger.debug).toHaveBeenCalledTimes(1); // The debug log before the attempt
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });
});
