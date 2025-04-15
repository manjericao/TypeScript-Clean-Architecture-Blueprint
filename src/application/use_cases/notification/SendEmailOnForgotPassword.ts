import { Operation } from '@application/use_cases/base';
import { ForgotPasswordEvent } from '@enterprise/events/auth';
import { UserResponseDTO } from '@enterprise/dto/output';
import { IEmailService } from '@application/contracts/communication/email';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IBootstrapper } from '@application/contracts/lifecycle';

/**
 * Interface representing the events related to sending an email when a user forgets their information.
 *
 * The `SendEmailOnForgotUserEvents` interface defines the structure of different events that can occur
 * during the process of handling a "forgot" action for user accounts. Each event is associated with a specific data structure.
 *
 * Events:
 * - `EMAIL_SENT` - Indicates a successful email sent operation. Contains the user's ID and email address.
 * - `ERROR` - Represents a generic error that occurred during the process, encapsulated as an Error object.
 * - `AVAILABILITY_ERROR` - Represents a specific error related to availability, provided as a string message.
 *
 * Extends:
 * - `Record<string, unknown>` - Allows defining additional keys beyond the predefined events.
 */
interface SendEmailOnForgotUserEvents extends Record<string, unknown> {
  EMAIL_SENT: { userId: string; email: string };
  ERROR: Error;
  AVAILABILITY_ERROR: string;
}

/**
 * The SendEmailOnForgotPassword class is responsible for handling the operations
 * required to send a reset password email to users when they trigger the "Forgot Password" feature.
 * It listens for the ForgotPassword event, processes the event, and attempts to send the email.
 *
 * This class extends the Operation class and implements the IBootstrapper interface.
 */
export class SendEmailOnForgotPassword extends Operation<SendEmailOnForgotUserEvents> implements IBootstrapper {
  /**
   * Constructs an instance of the class and initializes it with dependencies.
   *
   * @param {IEmailService} emailService - The email service instance used for sending emails.
   * @param {IConfig} config - The configuration service instance for application settings.
   * @param {ILogger} logger - The logger service instance for logging information and errors.
   * @return {void} Does not return a value.
   */
  constructor(
    private emailService: IEmailService,
    private config: IConfig,
    private logger: ILogger
  ) {
    super(['EMAIL_SENT', 'ERROR', 'AVAILABILITY_ERROR']);
  }

  /**
   * Initializes the process of subscribing to the 'ForgotPassword' event and handling the associated logic.
   *
   * The method subscribes to the 'ForgotPassword' event type and invokes the handler when the event is triggered.
   * In case of errors during the handling process, the error is logged and emitted as output.
   *
   * @return {void} This method does not return any value.
   */
  public bootstrap(): void {
    this.subscribeTo<ForgotPasswordEvent>('ForgotPassword', (event) => {
      this.handleForgotPassword(event)
        .catch(error => {
          this.logger.error('Error handling ForgotPassword event', {
            error: error instanceof Error ? error.message : String(error),
            userId: event.user.id,
            token: event.token.token
          });
          this.emitOutput('ERROR', error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  /**
   * Handles the forgot password event by preparing and sending a verification email.
   *
   * @param {ForgotPasswordEvent} event The event containing user and token information required to process the forgot password request.
   * @return {Promise<void>} A promise that resolves when the email process completes successfully.
   */
  private async handleForgotPassword(event: ForgotPasswordEvent): Promise<void> {
    this.logger.info('Verification token created event received, preparing to send email', {
      userId: event.user.id,
      tokenId: event.token.id
    });
    await this.execute(event.user, event.token.token);
  }

  /**
   * Executes the process of sending a reset password email to the user.
   * This includes verifying SMTP server availability, constructing the reset
   * password URL, sending the email, and logging the actions.
   *
   * @param {UserResponseDTO} user - An object containing user information, including their email address and name.
   * @param {string} token - A token used to construct the reset password URL.
   * @return {Promise<void>} A Promise that resolves when the process is complete.
   */
  async execute(user: UserResponseDTO, token: string): Promise<void> {
    const { EMAIL_SENT, ERROR, AVAILABILITY_ERROR } = this.outputs;

    try {
      const verifyEmailAvailability = await this.emailService.verify();
      if (!verifyEmailAvailability) {
        this.emitOutput(AVAILABILITY_ERROR,
          `There was an error with the availability of the SMTP server;
          Try to check with the administrator of the system`);
        return;
      }

      const resetPassUrl = `${this.config.server.host}/auth/reset-pass?token=${token}`;

      await this.emailService.sendEmail({
        to: user.email,
        subject: '[PPL] Reset Your Password',
        template: 'reset-password',
        context: {
          name: user.name,
          resetPassUrl,
          expiresInHours: this.config.jwt.resetPasswordExpirationMinutes / 60,
          currentYear: new Date().getFullYear()
        }
      });

      this.logger.info('Reset password email sent successfully', {
        userId: user.id,
        email: user.email
      });

      this.emitOutput(EMAIL_SENT, {
        userId: user.id,
        email: user.email
      });
    } catch (error) {
      this.logger.error('Error sending reset password email', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id
      });
      this.emitOutput(ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
