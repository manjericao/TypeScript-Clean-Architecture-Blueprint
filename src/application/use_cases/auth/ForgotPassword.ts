import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenGenerator } from '@application/contracts/security/authentication';
import { BaseOperationEvents, BaseOperation, OperationError } from '@application/use_cases/base';
import { EmailUserDTO } from '@enterprise/dto/input/auth';
import { TokenType } from '@enterprise/enum';
import { ForgotPasswordEvent } from '@enterprise/events/auth';

/**
 * Defines the events specific to the ForgotPassword operation.
 * Extends BaseOperationEvents where SUCCESS payload is void (operation initiated successfully)
 * and ERROR payload is OperationError.
 * Includes specific failure cases:
 * - USER_NOT_FOUND: Emitted with a string message when the provided email doesn't exist.
 * - ACCOUNT_NOT_VERIFIED: Emitted with a string message when the account associated with the email is not verified.
 */
type ForgotPasswordEvents = BaseOperationEvents<void> & {
  USER_NOT_FOUND: string;
  ACCOUNT_NOT_VERIFIED: string;
};

/**
 * ForgotPassword handles the process of initiating a password reset for a user.
 * It verifies the user exists and is verified, generates a reset token, saves it,
 * and publishes an event to trigger sending the reset email.
 * Extends BaseOperation to manage events: SUCCESS, ERROR, USER_NOT_FOUND, ACCOUNT_NOT_VERIFIED.
 *
 * @extends BaseOperation<ForgotPasswordEvents>
 */
export class ForgotPassword extends BaseOperation<ForgotPasswordEvents> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenRepository: ITokenRepository,
    private readonly tokenGenerator: ITokenGenerator, // Renamed from generateToken for consistency
    private readonly config: IConfig,
    readonly logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'USER_NOT_FOUND', 'ACCOUNT_NOT_VERIFIED'], logger);
  }

  /**
   * Executes the forgot password process.
   * Validates the user's email, checks account status, generates and saves a reset token,
   * and emits appropriate events.
   *
   * @param {EmailUserDTO} data - The input DTO containing the user's email.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async execute(data: EmailUserDTO): Promise<void> {
    this.logger.info(`ForgotPassword operation started for email: ${data.email}`, {
      input: data
    });

    try {
      this.logger.debug(`Checking for existing user with email ${data.email}`);
      const user = await this.userRepository.findByEmail(data.email);

      if (!user) {
        const message = `No user found with email ${data.email}`;
        this.logger.warn!(`ForgotPassword failed: ${message}`);

        this.emitOutput('USER_NOT_FOUND', message);
        return;
      }

      if (!user.isVerified) {
        const message =
          'Account associated with this email is not verified. Please verify your email before resetting password.';
        this.logger.warn!(`ForgotPassword failed: ${message}`, { email: data.email });

        this.emitOutput('ACCOUNT_NOT_VERIFIED', message);
        return;
      }

      const expiresAt = new Date(
        Date.now() + this.config.jwt.resetPasswordExpirationMinutes * 60 * 1000
      );

      this.logger.debug(`Generating password reset token for user ${user.id}`);
      const resetToken = this.tokenGenerator.generateToken(
        TokenType.RESET_PASSWORD,
        expiresAt.getHours()
      );

      this.logger.debug(`Saving password reset token for user ${user.id}`);
      const token = await this.tokenRepository.create({
        token: resetToken,
        userId: user.id,
        type: TokenType.RESET_PASSWORD,
        expiresAt: expiresAt,
        isRevoked: false
      });

      this.logger.info(`Password reset token generated and saved`, {
        userId: user.id,
        tokenId: token.id
      });

      this.publishDomainEvent(new ForgotPasswordEvent(user, token));
      this.logger.info(`Published ForgotPasswordEvent for user ${user.id}`);

      this.logger.info(`ForgotPassword succeeded: Reset process initiated for ${data.email}`);
      this.emitSuccess(`Forgot Password succeeded for ${data.email}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError(
          'FORGOT_PASSWORD_FAILED',
          `Failed to process forgot password request for ${data.email}: ${err.message}`,
          err
        )
      );
    }
  }
}
