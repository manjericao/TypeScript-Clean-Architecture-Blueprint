import { Operation } from '@application/use_cases/base';
import { TokenType } from '@enterprise/enum';
import { ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

/**
 * Interface representing the event payloads for email verification events.
 *
 * This interface defines the structure of various events that can occur during
 * the email verification process.
 *
 * Properties:
 *  - SUCCESS: Represents a successful email verification. Contains the user's ID.
 *  - ERROR: Represents a general error event. Contains an instance of the Error object.
 *  - TOKEN_NOT_FOUND: Represents an error when the verification token is not found.
 *  - USER_NOT_FOUND: Represents an error when the user associated with the token is not found.
 *  - TOKEN_EXPIRED: Represents an error when the verification token has expired.
 *  - ALREADY_VERIFIED: Represents a notification when the user is already verified.
 */
interface VerifyEmailEvents extends Record<string, unknown> {
  SUCCESS: { userId: string };
  ERROR: Error;
  TOKEN_NOT_FOUND: string;
  USER_NOT_FOUND: string;
  TOKEN_EXPIRED: string;
  ALREADY_VERIFIED: { userId: string };
}

/**
 * The `VerifyEmail` class provides functionality for verifying a user's email
 * by validating a verification token and updating the user's verification status.
 */
export class VerifyEmail extends Operation<VerifyEmailEvents> {
  /**
   * Constructs an instance of the VerifyEmail class with required dependencies.
   *
   * @param {IUserRepository} userRepository - The repository instance for user data operations.
   * @param {ITokenRepository} tokenRepository - The repository instance for token operations.
   * @param {ILogger} logger - The logger instance for logging messages and errors.
   */
  constructor(
    private userRepository: IUserRepository,
    private tokenRepository: ITokenRepository,
    private logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'TOKEN_NOT_FOUND', 'USER_NOT_FOUND', 'TOKEN_EXPIRED', 'ALREADY_VERIFIED']);
  }

  /**
   * Executes the email verification process using the provided token.
   *
   * @param {string} token - The verification token string.
   * @return {Promise<void>} A promise that resolves once the verification process completes.
   */
  async execute(token: string): Promise<void> {
    try {
      const tokenRecord = await this.tokenRepository.findByToken(token);

      if (!tokenRecord) {
        this.logger.info('Verification token not found', { token });
        this.emitTyped('TOKEN_NOT_FOUND', 'Verification token not found');
        return;
      }

      if (tokenRecord.type !== TokenType.VERIFICATION) {
        this.logger.info('Invalid token type for verification', { tokenId: tokenRecord.id, type: tokenRecord.type });
        this.emitTyped('TOKEN_NOT_FOUND', 'Invalid token for verification');
        return;
      }

      if (new Date() > tokenRecord.expiresAt) {
        this.logger.info('Verification token expired', { tokenId: tokenRecord.id, userId: tokenRecord.userId });
        this.emitTyped('TOKEN_EXPIRED', 'Verification token has expired');
        return;
      }

      const user = await this.userRepository.findById(tokenRecord.userId);

      if (!user) {
        this.logger.info('User not found for verification token', { tokenId: tokenRecord.id, userId: tokenRecord.userId });
        this.emitTyped('USER_NOT_FOUND', 'User not found for this verification token');
        return;
      }

      if (user.isVerified) {
        this.logger.info('User is already verified', { userId: user.id });
        this.emitTyped('ALREADY_VERIFIED', { userId: user.id });
        return;
      }

      user.isVerified = true;
      await this.userRepository.update(user.id, user);

      await this.tokenRepository.delete(tokenRecord.id!);

      this.logger.info('User email successfully verified', { userId: user.id });
      this.emitTyped('SUCCESS', { userId: user.id });
    } catch (error) {
      this.logger.error('Error verifying email', {
        error: error instanceof Error ? error.message : String(error),
        token
      });
      this.emitTyped('ERROR', error instanceof Error ? error : new Error(String(error)));
    }
  }
}
