import { Operation } from '@application/use_cases/base';
import { EmailUserDTO } from '@enterprise/dto/input/auth';
import { TokenType } from '@enterprise/enum';
import { ForgotPasswordEvent } from '@enterprise/events/auth';
import { ITokenGenerator } from '@application/contracts/security/authentication';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

/**
 * Interface representing the event types and data structure for handling forgot password operations.
 *
 * This interface is typically used to define the structure of events
 * emitted during the execution of forgotten password requests, such as success,
 * errors, and specific failure cases.
 *
 * The keys in this interface represent the types of events that can occur,
 * and their corresponding values indicate the data type associated with each event.
 *
 * - SUCCESS: Contains a message string providing information about the successful operation.
 * - ERROR: Includes an instance of the Error object representing any error that occurred.
 * - USER_NOT_FOUND: String detailing that the requested user does not exist.
 * - ACCOUNT_NOT_VERIFIED: String indicating the user's account has not been verified.
 *
 * Extends:
 * - Record<string, unknown>: Ensures compatibility with generic key-value pairs for extensibility.
 */
interface ForgotPasswordEvents extends Record<string, unknown> {
  SUCCESS: { message: string };
  ERROR: Error;
  USER_NOT_FOUND: string;
  ACCOUNT_NOT_VERIFIED: string;
}

/**
 * The ForgotPassword class handles the process of initiating a password reset for a user.
 * It verifies user existence, checks if the account is verified, generates a reset token,
 * and saves it for later verification. Emits events based on the outcome of the operation.
 *
 * Extends: Operation<ForgotPasswordEvents>
 *
 * Outputs:
 * - SUCCESS: Indicates the password reset link was successfully sent.
 * - ERROR: Indicates an error occurred while processing the request.
 * - USER_NOT_FOUND: Emitted when the email provided does not match any user.
 * - ACCOUNT_NOT_VERIFIED: Emitted if the user's account is not verified.
 *
 * @class ForgotPassword
 * @param {IUserRepository} userRepository - Repository interface for user data operations.
 * @param {ITokenRepository} tokenRepository - Repository interface for token storage and retrieval.
 * @param {ITokenGenerator} generateToken - Interface for generating secure tokens.
 * @param {IConfig} config - Configuration object containing application-specific settings.
 * @param {ILogger} logger - Interface for logging informational and error messages.
 *
 * @method execute
 * Asynchronous method to handle the forgot password process.
 * Validates the user existence, checks account verification status,
 * generates a reset password token, and emits the appropriate event.
 *
 * @param {EmailUserDTO} data - Data transfer object containing email information.
 * @returns {Promise<void>} A promise that resolves when the operation is completed.
 * @throws Emits 'ERROR' if an unexpected error occurs during the operation.
 */
export class ForgotPassword extends Operation<ForgotPasswordEvents> {
  /**
   * Constructs an instance of the class.
   *
   * @param {IUserRepository} userRepository - The repository interface for user entity operations.
   * @param {ITokenRepository} tokenRepository - The repository interface for token-related operations.
   * @param {ITokenGenerator} generateToken - A utility for generating tokens.
   * @param {IConfig} config - Configuration settings interface.
   * @param {ILogger} logger - Logger utility interface for logging operations.
   *
   * @return {void} Initializes the class instance and its dependencies.
   */
  constructor(
    private userRepository: IUserRepository,
    private tokenRepository: ITokenRepository,
    private generateToken: ITokenGenerator,
    private config: IConfig,
    private logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'USER_NOT_FOUND', 'ACCOUNT_NOT_VERIFIED']);
  }

  /**
   * Processes a forgot password request by validating the user, checking account verification status,
   * generating a reset password token, and saving it in the token repository.
   *
   * @param {EmailUserDTO} data - The data required for password reset, including the user's email.
   * @return {Promise<void>} A promise that resolves when the forgot password process completes successfully or with an error output.
   */
  async execute(data: EmailUserDTO): Promise<void> {
    const { SUCCESS, ERROR, USER_NOT_FOUND, ACCOUNT_NOT_VERIFIED } = this.outputs;

    try {
      this.logger.info('Processing forgot password request', { email: data.email });

      const user = await this.userRepository.findByEmail(data.email);

      if (!user) {
        this.logger.error('Forgot password attempt for non-existent user', { email: data.email });
        this.emitOutput(USER_NOT_FOUND, `No user found with email ${data.email}`);
        return;
      }

      // Check if user account is verified
      if (!user.isVerified) {
        this.logger.error('Forgot password attempt on unverified account', { email: data.email });
        this.emitOutput(ACCOUNT_NOT_VERIFIED, 'Please verify your email before resetting password');
        return;
      }

      const expiresAt = new Date(Date.now() + this.config.jwt.resetPasswordExpirationMinutes * 60 * 1000);

      // Generate reset password token
      const resetToken = this.generateToken.generateToken(TokenType.RESET_PASSWORD, expiresAt.getHours());

      // Save reset token
      const token = await this.tokenRepository.create({
        token: resetToken,
        userId: user.id,
        type: TokenType.RESET_PASSWORD,
        expiresAt: expiresAt,
        isRevoked: false
      });

      this.logger.info('Password reset token generated', { userId: user.id });

      this.publishDomainEvent(new ForgotPasswordEvent(user, token));

      this.emitOutput(SUCCESS, { message: 'Password reset link sent to your email' });
    } catch (error) {
      this.logger.error('Error in forgot password process', error);
      this.emitOutput(ERROR, error as Error);
    }
  }
}
