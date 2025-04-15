import { Operation } from '@application/use_cases/base';
import { TokenCreatedEvent } from '@enterprise/events/token';
import { TokenType } from '@enterprise/enum';
import { UserResponseDTO } from '@enterprise/dto/output';
import { EmailUserDTO } from '@enterprise/dto/input/auth';
import { IBootstrapper } from '@application/contracts/lifecycle';
import { IEmailService } from '@application/contracts/communication/email';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

/**
 * Interface representing the event structure for sending email notifications upon user creation.
 *
 * This interface extends the Record<string, unknown>, allowing for indexed properties with string keys.
 * It defines specific events related to the process of sending emails to users during account creation.
 *
 * @interface
 */
interface SendEmailOnUserCreationEvents extends Record<string, unknown> {
  EMAIL_SENT: { userId: string; email: string };
  ERROR: Error;
  AVAILABILITY_ERROR: string;
  NOTFOUND_ERROR: string;
  USER_NOT_FOUND: string;
  USER_ALREADY_VERIFIED: { userId: string; email: string };
}

/**
 * The `SendEmailOnUserCreation` class provides functionality for sending a
 * verification email to a user when a corresponding token is created.
 * It subscribes to events and handles the process of constructing and
 * sending a verification email by integrating with user repository and email service.
 */
export class SendEmailOnUserCreation extends Operation<SendEmailOnUserCreationEvents> implements IBootstrapper {
  /**
   * Constructor for initializing the class with dependencies.
   *
   * @param {ITokenRepository} tokenRepository - The repository for managing tokens.
   * @param {IUserRepository} userRepository - The repository for managing users.
   * @param {IEmailService} emailService - The service for sending emails.
   * @param {IConfig} config - The configuration settings.
   * @param {ILogger} logger - The logging utility.
   *
   * @return {void} Initializes the class and sets up required dependencies.
   */
  constructor(
    private tokenRepository: ITokenRepository,
    private userRepository: IUserRepository,
    private emailService: IEmailService,
    private config: IConfig,
    private logger: ILogger
  ) {
    super(['EMAIL_SENT', 'ERROR', 'NOTFOUND_ERROR', 'USER_NOT_FOUND', 'AVAILABILITY_ERROR', 'USER_ALREADY_VERIFIED']);
  }

  /**
   * Initializes the event subscriptions and sets up the handling of TokenCreated events.
   *
   * @return {void} This method does not return any value.
   */
  public bootstrap(): void {
    this.subscribeTo<TokenCreatedEvent>('TokenCreated', (event) => {
      this.handleTokenCreated(event)
        .catch(error => {
          this.logger.error('Error handling TokenCreated event', {
            error: error instanceof Error ? error.message : String(error),
            userId: event.user.id
          });
          this.emitOutput('ERROR', error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  /**
   * Handles the event when a token is created. Logs the event and processes the token
   * by sending an email based on the token details.
   *
   * @param {TokenCreatedEvent} event - The event containing token creation details, including
   *                                     user information and the created token data.
   * @return {Promise<void>} A promise that resolves once the event is logged and the token
   *                         is processed.
   */
  private async handleTokenCreated(event: TokenCreatedEvent): Promise<void> {
    this.logger.info('Verification token created event received, preparing to send email', {
      userId: event.user.id
    });
    await this.execute(event.user);
  }


  async execute(userOrEmail: UserResponseDTO | EmailUserDTO): Promise<void> {
    const { EMAIL_SENT, ERROR, NOTFOUND_ERROR, AVAILABILITY_ERROR, USER_ALREADY_VERIFIED } = this.outputs;

    const user = await this.resolveUserFromInput(userOrEmail);

    if (!user) {
      return;
    }

    try {
      if (user.isVerified) {
        this.logger.info('User is already verified, skipping verification email', {
          userId: user.id,
          email: user.email
        });
        this.emitOutput(USER_ALREADY_VERIFIED, { userId: user.id, email: user.email });
        return;
      }

      const tokens = await this.tokenRepository.findByUserId(user.id);

      const verificationToken = tokens.find(token => token.type === TokenType.VERIFICATION);

      if (!verificationToken) {
        const message = `No verification token found for user: ${user.id}`;
        this.logger.info(message, { userId: user.id });
        this.emitOutput(NOTFOUND_ERROR, message);
        return;
      }

      const verifyEmailAvailability = await this.emailService.verify();
      if (!verifyEmailAvailability) {
        this.emitOutput(AVAILABILITY_ERROR,
          `There was an error with the availability of the SMTP server;
          Try to check with the administrator of the system`);
        return;
      }

      const verificationUrl = `${this.config.server.host}/auth/verify-email?token=${verificationToken.token}`;

      await this.emailService.sendEmail({
        to: user.email,
        subject: '[PPL] Validate Your User Account',
        template: 'email-verification-token',
        context: {
          name: user.name,
          verificationUrl,
          expiresInHours: this.config.jwt.accessExpirationMinutes / 60,
          currentYear: new Date().getFullYear()
        }
      });

      this.logger.info('Verification email sent successfully', {
        userId: user.id,
        email: user.email
      });

      this.emitOutput(EMAIL_SENT, {
        userId: user.id,
        email: user.email
      });
    } catch (error) {
      this.logger.error('Error sending verification email', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id
      });
      this.emitOutput(ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Resolves a user entity from different input types
   * @param userOrEmail - Either a user object or email DTO
   * @returns The user object or null if not found
   */
  private async resolveUserFromInput(userOrEmail: EmailUserDTO | UserResponseDTO): Promise<UserResponseDTO | null> {
    const { USER_NOT_FOUND } = this.outputs;
    if (userOrEmail instanceof EmailUserDTO) {
      const foundUser = await this.userRepository.findByEmail(userOrEmail.email);

      if (!foundUser) {
        this.logger.error('User not found for email verification', { email: userOrEmail.email });
        this.emitOutput(USER_NOT_FOUND, `User not found with email: ${userOrEmail.email}`);
        return null;
      }

      return foundUser;
    }

    return userOrEmail;
  }
}
