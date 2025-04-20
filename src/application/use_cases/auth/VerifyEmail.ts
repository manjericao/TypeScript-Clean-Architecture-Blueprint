import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { BaseOperationEvents, BaseOperation, OperationError } from '@application/use_cases/base';
import { TokenInputDTO } from '@enterprise/dto/input/token';
import { TokenType } from '@enterprise/enum';

/**
 * Defines the payload for the SUCCESS event upon successful email verification.
 */
type VerifyEmailSuccessPayload = {
  userId: string;
};

/**
 * Defines the payload for the ALREADY_VERIFIED event.
 */
type AlreadyVerifiedPayload = {
  userId: string;
};

/**
 * Defines the events specific to the VerifyEmail operation.
 * Extends BaseOperationEvents where SUCCESS payload is VerifyEmailSuccessPayload
 * and ERROR payload is OperationError.
 * Includes specific failure/status cases:
 * - TOKEN_NOT_FOUND: Emitted with a string message when the verification token is not found.
 * - USER_NOT_FOUND: Emitted with a string message when the user associated with the token is not found.
 * - TOKEN_EXPIRED: Emitted with a string message when the token has expired.
 * - INVALID_TOKEN: Emitted with a string message for tokens of the wrong type.
 * - ALREADY_VERIFIED: Emitted with AlreadyVerifiedPayload when the user's email is already verified.
 */
type VerifyEmailEvents = BaseOperationEvents<VerifyEmailSuccessPayload> & {
  TOKEN_NOT_FOUND: string;
  USER_NOT_FOUND: string;
  TOKEN_EXPIRED: string;
  INVALID_TOKEN: string;
  ALREADY_VERIFIED: AlreadyVerifiedPayload;
};

/**
 * VerifyEmail handles the email verification process using a token.
 * It finds the token, validates it (type, expiry), finds the associated user,
 * verifies the user if not already verified, and cleans up the token.
 * Extends BaseOperation to manage events: SUCCESS, ERROR, TOKEN_NOT_FOUND,
 * USER_NOT_FOUND, TOKEN_EXPIRED, INVALID_TOKEN, ALREADY_VERIFIED.
 *
 * @extends BaseOperation<VerifyEmailEvents>
 */
export class VerifyEmail extends BaseOperation<VerifyEmailEvents> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenRepository: ITokenRepository,
    readonly logger: ILogger
  ) {
    super(
      [
        'SUCCESS',
        'ERROR',
        'TOKEN_NOT_FOUND',
        'USER_NOT_FOUND',
        'TOKEN_EXPIRED',
        'INVALID_TOKEN',
        'ALREADY_VERIFIED'
      ],
      logger
    );
  }

  /**
   * Executes the email verification process.
   * Validates the token, checks user status, marks the user as verified, deletes the token, and emits events.
   *
   * @param {TokenInputDTO} dto - The verification token provided by the user.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async execute(dto: TokenInputDTO): Promise<void> {
    const { token } = dto;

    this.logger.info(`VerifyEmail operation started.`, { input: { token: '[REDACTED]' } });

    try {
      this.logger.debug('Attempting to find verification token.');
      const tokenRecord = await this.tokenRepository.findByToken(token);

      if (!tokenRecord) {
        const message = 'Verification failed: Token not found.';
        this.logger.warn!(message);

        this.emitOutput('TOKEN_NOT_FOUND', 'Invalid or expired verification link.');
        return;
      }

      this.logger.debug(`Found token record.`, {
        tokenId: tokenRecord.id,
        userId: tokenRecord.userId
      });

      // Check token type
      if (tokenRecord.type !== TokenType.VERIFICATION) {
        const message = `Verification failed: Invalid token type provided. Expected VERIFICATION, got ${tokenRecord.type}.`;
        this.logger.warn!(message, { tokenId: tokenRecord.id });

        this.emitOutput('TOKEN_NOT_FOUND', 'Invalid or expired verification link.');
        return;
      }

      if (tokenRecord.expiresAt.getTime() < Date.now()) {
        const message = `Verification failed: Token expired.`;
        this.logger.warn!(message, { tokenId: tokenRecord.id, expiresAt: tokenRecord.expiresAt });

        await this.tokenRepository.delete(tokenRecord.id!);
        this.logger.debug('Deleted expired verification token.', { tokenId: tokenRecord.id });
        this.emitOutput(
          'TOKEN_EXPIRED',
          'Verification link has expired. Please request a new one.'
        );
        return;
      }

      this.logger.debug(`Attempting to find user associated with token: ${tokenRecord.userId}`);
      const user = await this.userRepository.findById(tokenRecord.userId);

      if (!user) {
        const message = `Verification failed: User not found for token.`;
        this.logger.error(message, { tokenId: tokenRecord.id, userId: tokenRecord.userId });

        await this.tokenRepository.delete(tokenRecord.id!);
        this.logger.debug('Deleted orphaned verification token.', { tokenId: tokenRecord.id });

        this.emitOutput('USER_NOT_FOUND', 'Invalid or expired verification link.');
        return;
      }

      this.logger.debug(`Found user.`, { userId: user.id, isVerified: user.isVerified });

      if (user.isVerified) {
        const message = `Verification skipped: User is already verified.`;
        this.logger.info(message, { userId: user.id });

        await this.tokenRepository.delete(tokenRecord.id!);
        this.logger.debug('Deleted redundant verification token for already verified user.', {
          tokenId: tokenRecord.id
        });

        this.emitOutput('ALREADY_VERIFIED', { userId: user.id });
        return;
      }

      this.logger.debug(`Updating user verification status.`, { userId: user.id });
      await this.userRepository.update(user.id, { isVerified: true });
      this.logger.debug(`User verification status updated successfully.`, { userId: user.id });

      this.logger.debug(`Deleting used verification token.`, { tokenId: tokenRecord.id });
      await this.tokenRepository.delete(tokenRecord.id!);
      this.logger.debug(`Verification token deleted successfully.`, { tokenId: tokenRecord.id });

      const successPayload: VerifyEmailSuccessPayload = { userId: user.id };
      this.logger.info(`VerifyEmail succeeded: User email verified successfully.`, {
        userId: user.id
      });
      this.emitSuccess(successPayload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError(
          'EMAIL_VERIFICATION_FAILED',
          `Failed to process email verification request: ${err.message}`,
          err
        )
      );
    }
  }
}
