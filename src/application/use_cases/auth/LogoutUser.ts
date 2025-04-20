import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenBlackList } from '@application/contracts/security/authentication';
import { BaseOperation, BaseOperationEvents, OperationError } from '@application/use_cases/base';
import { LogoutRequestDTO } from '@enterprise/dto/input/auth';

/**
 * Defines the payload for the SUCCESS event upon successful logout.
 */
type LogoutSuccessPayload = {
  message: string;
};

/**
 * Defines the events specific to the LogoutUser operation.
 * Extends BaseOperationEvents where SUCCESS payload is LogoutSuccessPayload
 * and ERROR payload is OperationError.
 * Includes specific failure cases:
 * - INVALID_TOKEN: Emitted with a string message when required tokens are missing or invalid.
 */
type LogoutUserEvents = BaseOperationEvents<LogoutSuccessPayload> & {
  INVALID_TOKEN: string;
};

/**
 * LogoutUser handles the user logout process by invalidating tokens.
 * It blocklists the provided access and refresh tokens.
 * Extends BaseOperation to manage events: SUCCESS, ERROR, INVALID_TOKEN.
 *
 * @extends BaseOperation<LogoutUserEvents>
 */
export class LogoutUser extends BaseOperation<LogoutUserEvents> {
  constructor(
    private readonly tokenBlackList: ITokenBlackList,
    private readonly config: IConfig,
    readonly logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'INVALID_TOKEN'], logger);
  }

  /**
   * Executes the user logout process. Invalidates both access and refresh tokens
   * by adding them to the blocklist.
   * Emits specific events based on the operation's result.
   *
   * @param {LogoutRequestDTO} logoutData - An object containing the access and refresh tokens to invalidate.
   * @returns {Promise<void>} A promise that resolves when the process is complete.
   */
  async execute(logoutData: LogoutRequestDTO): Promise<void> {
    this.logger.info('LogoutUser operation started.', {
      hasAccessToken: !!logoutData.accessToken,
      hasRefreshToken: !!logoutData.refreshToken
    });

    try {
      if (!logoutData.accessToken || !logoutData.refreshToken) {
        const message = 'Logout failed: Access token or refresh token is missing.';
        this.logger.warn!(message);

        this.emitOutput('INVALID_TOKEN', 'Invalid or missing tokens provided.');
        return;
      }

      // Calculate expiry times for blocklisting (convert minutes/days to seconds if needed by ITokenBlackList)
      const accessTokenExpirySeconds = this.config.jwt.accessExpirationMinutes * 60;
      const refreshTokenExpirySeconds = this.config.jwt.refreshExpirationDays * 24 * 60 * 60;

      this.logger.debug('Attempting to add tokens to blacklist.', {
        accessTokenLength: logoutData.accessToken.length,
        refreshTokenLength: logoutData.refreshToken.length
      });

      await Promise.all([
        this.tokenBlackList.addToBlackList(logoutData.accessToken, accessTokenExpirySeconds),
        this.tokenBlackList.addToBlackList(logoutData.refreshToken, refreshTokenExpirySeconds)
      ]);

      const successPayload: LogoutSuccessPayload = {
        message: 'Successfully logged out.'
      };

      this.logger.info('LogoutUser succeeded: Tokens blacklisted successfully.');
      this.emitSuccess(successPayload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError('LOGOUT_FAILED', `Failed to process logout request: ${err.message}`, err)
      );
    }
  }
}
