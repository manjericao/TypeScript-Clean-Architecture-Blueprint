import { Operation } from '@application/use_cases/base';
import { ResetPasswordDTO } from '@enterprise/dto/input/auth';
import { TokenType } from '@enterprise/enum';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

/**
 * Represents events that can occur during the reset password process.
 */
interface ResetPasswordEvents extends Record<string, unknown> {
  SUCCESS: { message: string };
  ERROR: Error;
  TOKEN_NOT_FOUND: string;
  TOKEN_EXPIRED: string;
  INVALID_TOKEN: string;
}

/**
 * ResetPassword is a use-case class for managing the password reset process.
 * It validates the provided reset token, ensures it is valid and not expired,
 * updates the user's password, and deletes the used token upon success.
 *
 * The class communicates the result of the operation by emitting predefined
 * output events such as SUCCESS, ERROR, TOKEN_NOT_FOUND, TOKEN_EXPIRED,
 * and INVALID_TOKEN.
 *
 * Dependencies:
 * - IUserRepository: Interface for user data access methods.
 * - ITokenRepository: Interface for token storage and retrieval.
 * - IPasswordHasher: Interface for hashing passwords.
 * - ILogger: Interface for logging activities within the reset process.
 *
 * Outputs:
 * - SUCCESS: Indicates password reset was successful.
 * - ERROR: Indicates an error occurred during the password reset process.
 * - TOKEN_NOT_FOUND: Indicates the token is invalid, non-existent, or user associated with the token is not found.
 * - TOKEN_EXPIRED: Indicates the reset token has expired.
 * - INVALID_TOKEN: Indicates the token is not of the correct type for password reset.
 */
export class ResetPassword extends Operation<ResetPasswordEvents> {
  /**
   * Constructs an instance of the class.
   *
   * @param {IUserRepository} userRepository - Repository to handle user-related data operations.
   * @param {ITokenRepository} tokenRepository - Repository to manage token-related data operations.
   * @param {IPasswordHasher} passwordHasher - Utility for handling password hashing and verification.
   * @param {ILogger} logger - Logger used for logging application events or errors.
   * @return {void}
   */
  constructor(
    private userRepository: IUserRepository,
    private tokenRepository: ITokenRepository,
    private passwordHasher: IPasswordHasher,
    private logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'TOKEN_NOT_FOUND', 'TOKEN_EXPIRED', 'INVALID_TOKEN']);
  }

  /**
   * Executes the password reset process.
   *
   * @param {ResetPasswordDTO} data - The data object containing the reset token and new password.
   * @returns {Promise<void>} A promise that resolves when the password reset operation is complete.
   */
  async execute(data: ResetPasswordDTO): Promise<void> {
    const { SUCCESS, ERROR, TOKEN_NOT_FOUND, TOKEN_EXPIRED, INVALID_TOKEN } = this.outputs;

    try {
      this.logger.info('Processing password reset', { token: data.token });

      const tokenRecord = await this.tokenRepository.findByToken(data.token);

      if (!tokenRecord) {
        this.logger.error('Reset password token not found');
        this.emitOutput(TOKEN_NOT_FOUND, 'Invalid or expired reset token');
        return;
      }

      // Validate token type and expiration
      if (tokenRecord.type !== TokenType.RESET_PASSWORD) {
        this.logger.error('Invalid token type for password reset');
        this.emitOutput(INVALID_TOKEN, 'Invalid reset token');
        return;
      }

      if (new Date() > tokenRecord.expiresAt) {
        this.logger.error('Reset password token expired');
        this.emitOutput(TOKEN_EXPIRED, 'Reset token has expired');
        return;
      }

      const user = await this.userRepository.findById(tokenRecord.userId);

      if (!user) {
        this.logger.error('User not found for reset token');
        this.emitOutput(TOKEN_NOT_FOUND, 'User not found');
        return;
      }

      // Hash new password
      const hashedPassword = await this.passwordHasher.hashPassword(data.newPassword);

      await this.userRepository.update(user.id, { password: hashedPassword });

      // Delete the reset token
      await this.tokenRepository.delete(tokenRecord.id!);

      this.logger.info('Password successfully reset', { userId: user.id });
      this.emitOutput(SUCCESS, { message: 'Password reset successful' });
    } catch (error) {
      this.logger.error('Error in password reset process', error);
      this.emitOutput(ERROR, error as Error);
    }
  }
}
