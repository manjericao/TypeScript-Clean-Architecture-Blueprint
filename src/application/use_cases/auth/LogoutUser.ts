import { Operation } from '@application/use_cases/base';
import { LogoutRequestDTO } from '@enterprise/dto/input/auth';
import { ITokenBlackList } from '@application/contracts/security/authentication';
import { IConfig, ILogger } from '@application/contracts/infrastructure';

/**
 * Interface representing the events related to user logout.
 * This interface extends a generalized record structure to map event keys to their associated values.
 * It provides a standardized way to handle various outcomes of user logout.
 *
 * @interface LogoutUserEvents
 */
interface LogoutUserEvents extends Record<string, unknown> {
  SUCCESS: { message: string };
  ERROR: Error;
  INVALID_TOKEN: string;
}

/**
 * The LogoutUser class is responsible for handling user logout operations
 * and blacklisting their active tokens to prevent further usage.
 * It extends the Operation class and utilizes dependencies such as ITokenBlackList
 * for managing invalidated tokens.
 */
export class LogoutUser extends Operation<LogoutUserEvents> {
  /**
   * Constructs an instance of the service.
   *
   * @param {ITokenBlackList} tokenBlackList - Service to manage blacklisted tokens
   * @param {IConfig} config - Configuration provider for application settings
   * @param {ILogger} logger - Logger for capturing and managing application logs
   */
  constructor(
    private tokenBlackList: ITokenBlackList,
    private config: IConfig,
    private logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'INVALID_TOKEN']);
  }

  /**
   * Executes the user logout process. Invalidates both access and refresh tokens
   * by adding them to the blacklist.
   * Emits specific outputs based on the operation's result.
   *
   * @param {LogoutRequestDTO} logoutData - An object containing the access and refresh tokens to invalidate
   * @return {Promise<void>} A promise that resolves when the process is complete
   */
  async execute(logoutData: LogoutRequestDTO): Promise<void> {
    const { SUCCESS, ERROR, INVALID_TOKEN } = this.outputs;

    try {
      this.logger.info('Processing user logout');

      if (!logoutData.accessToken || !logoutData.refreshToken) {
        this.logger.error('Logout attempt with missing tokens');
        this.emitOutput(INVALID_TOKEN, 'Invalid or missing tokens');
        return;
      }

      await Promise.all([
        this.tokenBlackList.addToBlackList(
          logoutData.accessToken,
          Number(this.config.jwt.accessExpirationMinutes)
        ),
        this.tokenBlackList.addToBlackList(
          logoutData.refreshToken,
          Number(this.config.jwt.refreshExpirationDays)
        )
      ]);

      this.logger.info('User successfully logged out');
      this.emitOutput(SUCCESS, { message: 'Successfully logged out' });
    } catch (error) {
      this.logger.error('Error during logout process', error);
      this.emitOutput(ERROR, error as Error);
    }
  }
}
