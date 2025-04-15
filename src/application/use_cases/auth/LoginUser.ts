import { Operation } from '@application/use_cases/base';
import { AuthenticateUserDTO } from '@enterprise/dto/input/auth';
import { TokenType } from '@enterprise/enum';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { IJWTTokenGenerator } from '@application/contracts/security/authentication';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IUserRepository } from '@application/contracts/domain/repositories';

/**
 * Interface representing the events related to user login.
 * This interface extends a generalized record structure to map event keys to their associated values.
 * It provides a standardized way to handle various outcomes of user authentication.
 *
 * @interface LoginUserEvents
 */
interface LoginUserEvents extends Record<string, unknown> {
  SUCCESS: {
    userId: string;
    accessToken: string;
    accessTokenExpires: Date;
    refreshToken: string;
    refreshTokenExpires: Date;
  };
  ERROR: Error;
  INVALID_CREDENTIALS: string;
  USER_NOT_FOUND: string;
  ACCOUNT_NOT_VERIFIED: string;
}

/**
 * The LoginUser class is responsible for authenticating users based on their credentials.
 * It extends the Operation class and utilizes dependencies such as IUserRepository for retrieving
 * user data and IPasswordHasher for validating passwords.
 */
export class LoginUser extends Operation<LoginUserEvents> {
  /**
   * Constructs an instance of the service.
   *
   * @param {IUserRepository} userRepository - Provides methods to interact with user data storage.
   * @param {IPasswordHasher} passwordHasher - Utility to hash and verify passwords.
   * @param {IJWTTokenGenerator} tokenGenerator - Service to generate authentication tokens.
   * @param {IConfig} config - Configuration provider for application settings.
   * @param {ILogger} logger - Logger for capturing and managing application logs.
   */
  constructor(
    private userRepository: IUserRepository,
    private passwordHasher: IPasswordHasher,
    private tokenGenerator: IJWTTokenGenerator,
    private config: IConfig,
    private logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'INVALID_CREDENTIALS', 'USER_NOT_FOUND', 'ACCOUNT_NOT_VERIFIED']);
  }

  /**
   * Executes the user login process. Validates the user credentials, checks if the account
   * is verified, and generates an authentication token upon successful login.
   * Emits specific outputs based on the operation's result.
   *
   * @param {AuthenticateUserDTO} credentials - An object containing the user's email and password.
   * @return {Promise<void>} A promise that resolves when the process is complete.
   */
  async execute(credentials: AuthenticateUserDTO): Promise<void> {
    const { SUCCESS, ERROR, INVALID_CREDENTIALS, USER_NOT_FOUND, ACCOUNT_NOT_VERIFIED } = this.outputs;

    try {
      this.logger.info('Attempting user login', { email: credentials.email });

      const userWithPassword = await this.userRepository.findByEmailWithPassword(credentials.email);

      if (!userWithPassword) {
        this.logger.error('Login attempt for non-existent user', { email: credentials.email });
        this.emitOutput(USER_NOT_FOUND, `No user found with email ${credentials.email}`);
        return;
      }

      const isPasswordValid = await this.passwordHasher.comparePasswords(
        credentials.password,
        userWithPassword.password
      );

      if (!isPasswordValid) {
        this.logger.error('Invalid password attempt', { email: credentials.email });
        this.emitOutput(INVALID_CREDENTIALS, 'Invalid email or password');
        return;
      }

      if (!userWithPassword.isVerified) {
        this.logger.error('Login attempt on unverified account', { email: credentials.email });
        this.emitOutput(ACCOUNT_NOT_VERIFIED, 'Please verify your email before logging in');
        return;
      }

      const accessToken = this.tokenGenerator.generateJWTToken(
        {
          userId: userWithPassword.id,
          email: userWithPassword.email,
          role: userWithPassword.role
        },
        TokenType.ACCESS,
        this.config.jwt.accessExpirationMinutes,
      );

      const refreshToken = this.tokenGenerator.generateJWTToken(
        {
          userId: userWithPassword.id,
          email: userWithPassword.email,
          role: userWithPassword.role
        },
        TokenType.REFRESH,
        this.config.jwt.refreshExpirationDays,
      )

      this.logger.info('User logged in successfully', { userId: userWithPassword.id });

      const now = new Date();

      this.emitOutput(SUCCESS, {
        userId: userWithPassword.id,
        accessToken: accessToken,
        accessTokenExpires: new Date(now.getTime() + (this.config.jwt.accessExpirationMinutes * 60 * 1000)),
        refreshToken: refreshToken,
        refreshTokenExpires: new Date(now.getTime() + (this.config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000))
      });
    } catch (error) {
      this.logger.error('Error during login', { error });
      this.emitOutput(ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
