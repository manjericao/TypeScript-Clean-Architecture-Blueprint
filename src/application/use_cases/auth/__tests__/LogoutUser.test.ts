import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { LogoutUser } from '../LogoutUser';
import { LogoutRequestDTO } from '@enterprise/dto/input/auth';
import { ITokenBlackList } from '@application/contracts/security/authentication';
import { IConfig, ILogger } from '@application/contracts/infrastructure';

describe('LogoutUser', () => {
  let logoutUser: LogoutUser;
  let mockTokenBlackList: jest.Mocked<ITokenBlackList>;
  let mockConfig: jest.Mocked<IConfig>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockLogoutData: LogoutRequestDTO;

  beforeEach(() => {
    // Create mock implementations
    mockTokenBlackList = {
      addToBlackList: jest.fn(),
      isBlackListed: jest.fn(),
    };

    mockConfig = {
      jwt: {
        accessExpirationMinutes: 30,
        refreshExpirationDays: 7,
      },
    } as jest.Mocked<IConfig>;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockLogoutData = {
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
    };

    // Initialize the use case with mocks
    logoutUser = new LogoutUser(
      mockTokenBlackList,
      mockConfig,
      mockLogger
    );
  });

  it('should successfully logout user and blacklist tokens', async () => {
    // Setup success handler
    const successHandler = jest.fn();
    logoutUser.on('SUCCESS', successHandler);

    // Execute logout
    await logoutUser.execute(mockLogoutData);

    // Verify tokens were added to blacklist
    expect(mockTokenBlackList.addToBlackList).toHaveBeenCalledTimes(2);
    expect(mockTokenBlackList.addToBlackList).toHaveBeenCalledWith(
      mockLogoutData.accessToken,
      Number(mockConfig.jwt.accessExpirationMinutes)
    );
    expect(mockTokenBlackList.addToBlackList).toHaveBeenCalledWith(
      mockLogoutData.refreshToken,
      Number(mockConfig.jwt.refreshExpirationDays)
    );

    // Verify success event was emitted
    expect(successHandler).toHaveBeenCalledWith({ message: 'Successfully logged out' });

    // Verify logging
    expect(mockLogger.info).toHaveBeenCalledWith('Processing user logout');
    expect(mockLogger.info).toHaveBeenCalledWith('User successfully logged out');
  });

  it('should emit INVALID_TOKEN when access token is missing', async () => {
    // Setup invalid token handler
    const invalidTokenHandler = jest.fn();
    logoutUser.on('INVALID_TOKEN', invalidTokenHandler);

    // Execute with missing access token
    await logoutUser.execute({
      ...mockLogoutData,
      accessToken: '',
    });

    // Verify invalid token event was emitted
    expect(invalidTokenHandler).toHaveBeenCalledWith('Invalid or missing tokens');

    // Verify blacklist was not called
    expect(mockTokenBlackList.addToBlackList).not.toHaveBeenCalled();

    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalledWith('Logout attempt with missing tokens');
  });

  it('should emit INVALID_TOKEN when refresh token is missing', async () => {
    // Setup invalid token handler
    const invalidTokenHandler = jest.fn();
    logoutUser.on('INVALID_TOKEN', invalidTokenHandler);

    // Execute with missing refresh token
    await logoutUser.execute({
      ...mockLogoutData,
      refreshToken: '',
    });

    // Verify invalid token event was emitted
    expect(invalidTokenHandler).toHaveBeenCalledWith('Invalid or missing tokens');

    // Verify blacklist was not called
    expect(mockTokenBlackList.addToBlackList).not.toHaveBeenCalled();

    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalledWith('Logout attempt with missing tokens');
  });

  it('should emit ERROR when blacklisting fails', async () => {
    // Setup error handler
    const errorHandler = jest.fn();
    logoutUser.on('ERROR', errorHandler);

    // Setup blacklist to throw error
    const mockError = new Error('Blacklist operation failed');
    mockTokenBlackList.addToBlackList.mockRejectedValueOnce(mockError);

    // Execute logout
    await logoutUser.execute(mockLogoutData);

    // Verify error event was emitted
    expect(errorHandler).toHaveBeenCalledWith(mockError);

    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalledWith('Error during logout process', mockError);
  });
});
