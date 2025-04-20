import { IUserRepository } from '@application/contracts/domain/repositories';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IJWTTokenGenerator } from '@application/contracts/security/authentication';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { BaseOperationEvents, BaseOperation, OperationError } from '@application/use_cases/base';
import { AuthenticateUserDTO } from '@enterprise/dto/input/auth';
import { TokenType } from '@enterprise/enum';

/**
 * Defines the payload for the SUCCESS event upon successful login.
 */
type LoginSuccessPayload = {
  userId: string;
  accessToken: string;
  accessTokenExpires: Date;
  refreshToken: string;
  refreshTokenExpires: Date;
};

/**
 * Defines the events specific to the LoginUser operation.
 * Extends BaseOperationEvents where SUCCESS payload is LoginSuccessPayload
 * and ERROR payload is OperationError.
 * Includes specific failure cases:
 * - INVALID_CREDENTIALS: Emitted with a string message for incorrect password.
 * - USER_NOT_FOUND: Emitted with a string message when the provided email doesn't exist.
 * - ACCOUNT_NOT_VERIFIED: Emitted with a string message when the account is not verified.
 */
type LoginUserEvents = BaseOperationEvents<LoginSuccessPayload> & {
  INVALID_CREDENTIALS: string;
  USER_NOT_FOUND: string;
  ACCOUNT_NOT_VERIFIED: string;
};

/**
 * LoginUser handles the user authentication process.
 * It finds the user by email, verifies the password, checks account status (verified),
 * generates access and refresh tokens upon success.
 * Extends BaseOperation to manage events: SUCCESS, ERROR, INVALID_CREDENTIALS, USER_NOT_FOUND, ACCOUNT_NOT_VERIFIED.
 *
 * @extends BaseOperation<LoginUserEvents>
 */
export class LoginUser extends BaseOperation<LoginUserEvents> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenGenerator: IJWTTokenGenerator,
    private readonly config: IConfig,
    readonly logger: ILogger
  ) {
    super(
      ['SUCCESS', 'ERROR', 'INVALID_CREDENTIALS', 'USER_NOT_FOUND', 'ACCOUNT_NOT_VERIFIED'],
      logger
    );
  }

  /**
   * Executes the user login process.
   * Validates credentials, checks user status, generates tokens, and emits events.
   *
   * @param {AuthenticateUserDTO} credentials - The input DTO containing email and password.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async execute(credentials: AuthenticateUserDTO): Promise<void> {
    this.logger.info(`LoginUser operation started for email: ${credentials.email}`, {
      input: { email: credentials.email }
    });

    try {
      this.logger.debug(`Attempting to find user by email: ${credentials.email}`);
      const userWithPassword = await this.userRepository.findByEmailWithPassword(credentials.email);

      if (!userWithPassword) {
        const message = `Authentication failed: No user found with email ${credentials.email}`;
        this.logger.warn!(message);

        this.emitOutput('USER_NOT_FOUND', message);
        return;
      }

      this.logger.debug(`Comparing password for user: ${userWithPassword.id}`);
      const isPasswordValid = await this.passwordHasher.comparePasswords(
        credentials.password,
        userWithPassword.password
      );

      if (!isPasswordValid) {
        const message = `Authentication failed: Invalid credentials provided for email ${credentials.email}`;
        this.logger.warn!(message);

        this.emitOutput('INVALID_CREDENTIALS', 'Invalid email or password.'); // Generic message to user
        return;
      }

      if (!userWithPassword.isVerified) {
        const message = `Authentication failed: Account not verified for email ${credentials.email}`;
        this.logger.warn!(message);

        this.emitOutput('ACCOUNT_NOT_VERIFIED', 'Please verify your email before logging in.');
        return;
      }

      this.logger.debug(`Generating tokens for user: ${userWithPassword.id}`);
      const now = Date.now();

      const accessTokenPayload = {
        userId: userWithPassword.id,
        email: userWithPassword.email,
        role: userWithPassword.role
      };
      const accessToken = this.tokenGenerator.generateJWTToken(
        accessTokenPayload,
        TokenType.ACCESS,
        this.config.jwt.accessExpirationMinutes
      );
      const accessTokenExpires = new Date(
        now + this.config.jwt.accessExpirationMinutes * 60 * 1000
      );

      const refreshTokenPayload = {
        userId: userWithPassword.id
      };
      const refreshToken = this.tokenGenerator.generateJWTToken(
        refreshTokenPayload,
        TokenType.REFRESH,
        this.config.jwt.refreshExpirationDays * 24 * 60
      );
      const refreshTokenExpires = new Date(
        now + this.config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000
      );

      const successPayload: LoginSuccessPayload = {
        userId: userWithPassword.id,
        accessToken,
        accessTokenExpires,
        refreshToken,
        refreshTokenExpires
      };

      this.logger.info(`LoginUser succeeded: User logged in successfully.`, {
        userId: userWithPassword.id
      });

      this.emitSuccess(successPayload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError(
          'LOGIN_FAILED',
          `Failed to process login request for ${credentials.email}: ${err.message}`,
          err
        )
      );
    }
  }
}
