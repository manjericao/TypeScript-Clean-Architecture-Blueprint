import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { BaseOperationEvents, BaseOperation, OperationError } from '@application/use_cases/base';
import { ResetPasswordDTO } from '@enterprise/dto/input/auth';
import { TokenType } from '@enterprise/enum';

/**
 * Defines the payload for the SUCCESS event upon successful password reset.
 */
type ResetPasswordSuccessPayload = {
  message: string;
  userId: string; // Include userId for better context
};

/**
 * Defines the events specific to the ResetPassword operation.
 * Extends BaseOperationEvents where SUCCESS payload is ResetPasswordSuccessPayload
 * and ERROR payload is OperationError.
 * Includes specific failure cases:
 * - TOKEN_NOT_FOUND: Emitted with a string message when the reset token is invalid or doesn't exist.
 * - TOKEN_EXPIRED: Emitted with a string message when the reset token has expired.
 * - INVALID_TOKEN: Emitted with a string message for an incorrect token type or associated user issues.
 */
type ResetPasswordEvents = BaseOperationEvents<ResetPasswordSuccessPayload> & {
  TOKEN_NOT_FOUND: string;
  TOKEN_EXPIRED: string;
  INVALID_TOKEN: string;
};

/**
 * ResetPassword handles the process of resetting a user's password using a verification token.
 * It validates the token, finds the user, hashes the new password, updates the user, and deletes the token.
 * Extends BaseOperation to manage events: SUCCESS, ERROR, TOKEN_NOT_FOUND, TOKEN_EXPIRED, INVALID_TOKEN.
 *
 * @extends BaseOperation<ResetPasswordEvents>
 */
export class ResetPassword extends BaseOperation<ResetPasswordEvents> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenRepository: ITokenRepository,
    private readonly passwordHasher: IPasswordHasher,
    readonly logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'TOKEN_NOT_FOUND', 'TOKEN_EXPIRED', 'INVALID_TOKEN'], logger);
  }

  /**
   * Executes the password reset process.
   * Validates the token, updates the password, and emits events based on the outcome.
   *
   * @param {ResetPasswordDTO} data - The input DTO containing the reset token and the new password.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async execute(data: ResetPasswordDTO): Promise<void> {
    this.logger.info('ResetPassword operation started.', {
      tokenProvided: !!data.token
    });

    try {
      this.logger.debug('Attempting to find reset token record.');
      const tokenRecord = await this.tokenRepository.findByToken(data.token);

      if (!tokenRecord) {
        const message = 'Password reset failed: Token not found in repository.';
        this.logger.warn!(message);

        this.emitOutput('TOKEN_NOT_FOUND', 'Invalid or expired password reset link.');
        return;
      }

      this.logger.debug('Found token record.', {
        tokenId: tokenRecord.id,
        userId: tokenRecord.userId,
        type: tokenRecord.type
      });

      if (tokenRecord.type !== TokenType.RESET_PASSWORD) {
        const message = `Password reset failed: Invalid token type. Expected ${TokenType.RESET_PASSWORD}, got ${tokenRecord.type}.`;
        this.logger.warn!(message, { tokenId: tokenRecord.id });
        this.emitOutput('INVALID_TOKEN', 'Invalid password reset link.');
        return;
      }

      if (new Date() > tokenRecord.expiresAt) {
        const message = `Password reset failed: Token expired.`;
        this.logger.warn!(message, { tokenId: tokenRecord.id, expiresAt: tokenRecord.expiresAt });

        await this.tokenRepository.delete(tokenRecord.id!);
        this.emitOutput(
          'TOKEN_EXPIRED',
          'Password reset link has expired. Please request a new one.'
        );
        return;
      }

      this.logger.debug(`Attempting to find user associated with token.`, {
        userId: tokenRecord.userId
      });
      const user = await this.userRepository.findById(tokenRecord.userId);

      if (!user) {
        const message = `Password reset failed: User associated with token not found.`;
        this.logger.error(message, { userId: tokenRecord.userId, tokenId: tokenRecord.id });

        this.emitOutput('INVALID_TOKEN', 'Invalid password reset link.');
        return;
      }

      this.logger.debug(`Hashing new password for user.`, { userId: user.id });
      const hashedPassword = await this.passwordHasher.hashPassword(data.newPassword);

      this.logger.debug(`Updating user password in repository.`, { userId: user.id });
      await this.userRepository.update(user.id, { password: hashedPassword });

      this.logger.debug(`Deleting used reset token.`, { tokenId: tokenRecord.id });
      await this.tokenRepository.delete(tokenRecord.id!);

      const successPayload: ResetPasswordSuccessPayload = {
        message: 'Password has been reset successfully.',
        userId: user.id
      };

      this.logger.info(`ResetPassword succeeded: Password successfully reset for user.`, {
        userId: user.id
      });
      this.emitSuccess(successPayload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError(
          'RESET_PASSWORD_FAILED',
          `Failed to process password reset request: ${err.message}`,
          err
        )
      );
    }
  }
}
