import { IEmailService } from '@application/contracts/communication/email';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IBootstrapper } from '@application/contracts/lifecycle';
import { BaseOperationEvents, BaseOperation, OperationError } from '@application/use_cases/base';
import { TokenResponseDTO, UserResponseDTO } from '@enterprise/dto/output';
import { ForgotPasswordEvent } from '@enterprise/events/auth';

/**
 * Defines the payload for the SUCCESS event upon successful email sending.
 */
type SendEmailSuccessPayload = {
  userId: string;
  email: string;
};

/**
 * Defines the events specific to the SendEmailOnForgotPassword operation.
 * Extends BaseOperationEvents where SUCCESS payload is SendEmailSuccessPayload
 * and ERROR payload is OperationError.
 * Includes specific failure cases:
 * - AVAILABILITY_ERROR: Emitted with a string message when the email service is unavailable.
 */
type SendEmailOnForgotPasswordEvents = BaseOperationEvents<SendEmailSuccessPayload> & {
  AVAILABILITY_ERROR: string;
};

/**
 * SendEmailOnForgotPassword listens for the ForgotPasswordEvent and sends a password-reset email.
 * It verifies email service availability before attempting to send.
 * Extends BaseOperation to manage events: SUCCESS, ERROR, AVAILABILITY_ERROR.
 * Implements IBootstrapper to subscribe to the domain event upon application startup.
 *
 * @extends BaseOperation<SendEmailOnForgotPasswordEvents>
 * @implements IBootstrapper
 */
export class SendEmailOnForgotPassword
  extends BaseOperation<SendEmailOnForgotPasswordEvents>
  implements IBootstrapper
{
  constructor(
    private readonly emailService: IEmailService,
    private readonly config: IConfig,
    readonly logger: ILogger // Logger is now managed by BaseOperation constructor
  ) {
    // Pass all event names and the logger to the BaseOperation constructor
    super(['SUCCESS', 'ERROR', 'AVAILABILITY_ERROR'], logger);
  }

  /**
   * Subscribes to the 'ForgotPassword' domain event during application bootstrap.
   * When the event is received, it triggers the email sending process.
   */
  public bootstrap(): void {
    this.subscribeTo<ForgotPasswordEvent>('ForgotPassword', (event) => {
      this.handleForgotPassword(event).catch((error) => {
        const operationError = new OperationError(
          'EVENT_HANDLER_FAILED',
          `Error handling ForgotPassword event for user ${event.user.id}`,
          error instanceof Error ? error : new Error(String(error))
        );
        this.logger.error(operationError.message, {
          error: operationError.details,
          userId: event.user.id,
          token: event.token.token
        });
      });
    });
  }

  /**
   * Handles the incoming ForgotPasswordEvent by logging and calling the execute method.
   * @param event - The ForgotPasswordEvent data.
   */
  private async handleForgotPassword(event: ForgotPasswordEvent): Promise<void> {
    this.logger.info('ForgotPassword event received, preparing to send reset email.', {
      operation: this.constructor.name,
      userId: event.user.id,
      tokenId: event.token.id
    });

    await this.execute(event.user, event.token);
  }

  /**
   * Executes the operation to send a password-reset email to the specified user.
   *
   * @param {UserResponseDTO} user - The user requesting a password reset, including their ID and email address.
   * @param {TokenResponseDTO} token - The token generated for the password reset operation,
   * including the token string.
   * @return {Promise<void>} A promise that resolves when the operation is complete.
   * Any errors encountered during the process are logged and emitted appropriately.
   */
  async execute(user: UserResponseDTO, token: TokenResponseDTO): Promise<void> {
    this.logger.info(`SendEmailOnForgotPassword operation started for user: ${user.id}`, {
      operation: this.constructor.name,
      userId: user.id,
      email: user.email
    });

    try {
      this.logger.debug('Verifying email service availability.', {
        operation: this.constructor.name
      });
      const verifyEmailAvailability = await this.emailService.verify();
      if (!verifyEmailAvailability) {
        const message = 'Email service is currently unavailable. Cannot send reset password email.';
        this.logger.error(message, { operation: this.constructor.name, userId: user.id });

        this.emitOutput(
          'AVAILABILITY_ERROR',
          'Email service unavailable. Please try again later or contact support.'
        );
        return;
      }
      this.logger.debug('Email service is available.', { operation: this.constructor.name });

      const resetPassUrl = `${this.config.server.host}/auth/reset-pass?token=${token.token}`;
      const expiresInHours = this.config.jwt.resetPasswordExpirationMinutes / 60;

      this.logger.debug(`Sending password reset email to ${user.email}.`, {
        operation: this.constructor.name,
        userId: user.id
      });

      await this.emailService.sendEmail({
        to: user.email,
        subject: '[PPL] Reset Your Password',
        template: 'reset-password',
        context: {
          name: user.name,
          resetPassUrl,
          expiresInHours,
          currentYear: new Date().getFullYear()
        }
      });

      const successPayload: SendEmailSuccessPayload = {
        userId: user.id,
        email: user.email
      };

      this.emitSuccess(successPayload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError(
          'EMAIL_SEND_FAILED',
          `Failed to send password reset email to ${user.email}: ${err.message}`,
          err
        )
      );
    }
  }
}
