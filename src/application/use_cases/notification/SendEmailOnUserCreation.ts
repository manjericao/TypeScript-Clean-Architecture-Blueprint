import { IEmailService } from '@application/contracts/communication/email';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IBootstrapper } from '@application/contracts/lifecycle';
import { BaseOperationEvents, BaseOperation, OperationError } from '@application/use_cases/base';
import { EmailUserDTO } from '@enterprise/dto/input/auth';
import { UserResponseDTO } from '@enterprise/dto/output';
import { TokenType } from '@enterprise/enum';
import { TokenCreatedEvent } from '@enterprise/events/token';

/**
 * Defines the payload for the SUCCESS event upon successful email sending.
 */
type SendVerificationEmailSuccessPayload = {
  userId: string;
  email: string;
};

/**
 * Defines the payload for the USER_ALREADY_VERIFIED event.
 */
type UserAlreadyVerifiedPayload = {
  userId: string;
  email: string;
};

/**
 * Defines the events specific to the SendEmailOnUserCreation operation.
 * Extends BaseOperationEvents where SUCCESS payload is SendVerificationEmailSuccessPayload
 * and ERROR payload is OperationError.
 * Includes specific outcome events:
 * - AVAILABILITY_ERROR: Emitted with a string message when the email service is unavailable.
 * - USER_NOT_FOUND: Emitted with a string message when the user cannot be resolved.
 * - TOKEN_NOT_FOUND: Emitted with a string message when the verification token is missing.
 * - USER_ALREADY_VERIFIED: Emitted with userId and email when the user is already verified.
 */
type SendEmailOnUserCreationEvents = BaseOperationEvents<SendVerificationEmailSuccessPayload> & {
  AVAILABILITY_ERROR: string;
  USER_NOT_FOUND: string;
  TOKEN_NOT_FOUND: string;
  USER_ALREADY_VERIFIED: UserAlreadyVerifiedPayload;
};

/**
 * SendEmailOnUserCreation listens for the TokenCreated event and sends a verification email.
 * It handles specific outcomes like user not found, token not found, user already verified,
 * and email service unavailability as distinct events.
 * Unexpected errors are emitted via ERROR.
 * Extends BaseOperation to manage events.
 * Implement IBootstrapper to subscribe to the domain event.
 *
 * @extends BaseOperation<SendEmailOnUserCreationEvents>
 * @implements IBootstrapper
 */
export class SendEmailOnUserCreation
  extends BaseOperation<SendEmailOnUserCreationEvents>
  implements IBootstrapper
{
  constructor(
    private readonly tokenRepository: ITokenRepository,
    private readonly userRepository: IUserRepository,
    private readonly emailService: IEmailService,
    private readonly config: IConfig,
    readonly logger: ILogger
  ) {
    super(
      [
        'SUCCESS',
        'ERROR',
        'AVAILABILITY_ERROR',
        'USER_NOT_FOUND',
        'TOKEN_NOT_FOUND',
        'USER_ALREADY_VERIFIED'
      ],
      logger
    );
  }

  /**
   * Subscribes to the 'TokenCreated' domain event during application bootstrap.
   */
  public bootstrap(): void {
    this.subscribeTo<TokenCreatedEvent>('TokenCreated', (event) => {
      this.handleTokenCreated(event).catch((error) => {
        const operationError = new OperationError(
          'EVENT_HANDLER_FAILED',
          `Error handling TokenCreated event for user ${event.user.id}`,
          error instanceof Error ? error : new Error(String(error))
        );
        this.logger.error(operationError.message, {
          error: operationError.details,
          userId: event.user.id
        });
      });
    });
  }

  /**
   * Handles the incoming TokenCreatedEvent by logging and calling the execute method.
   * @param event - The TokenCreatedEvent data.
   */
  private async handleTokenCreated(event: TokenCreatedEvent): Promise<void> {
    this.logger.info('TokenCreated event received, preparing to send verification email.', {
      operation: this.constructor.name,
      userId: event.user.id
    });
    await this.execute(event.user);
  }

  /**
   * Executes the operation to send a verification email.
   * Emits specific events for common, expected outcomes (user not found, already verified, etc.)
   * and uses the ERROR event for unexpected exceptions.
   *
   * @param {UserResponseDTO | EmailUserDTO} userOrEmail - The user (or their email).
   * @return {Promise<void>}
   */
  async execute(userOrEmail: UserResponseDTO | EmailUserDTO): Promise<void> {
    const operationName = this.constructor.name;
    const context = { operation: operationName, input: userOrEmail };

    this.logger.info(`SendEmailOnUserCreation operation started.`, context);

    const user = await this.resolveUserFromInput(userOrEmail);
    if (!user) {
      const message = `User could not be resolved for verification email. Input: ${JSON.stringify(userOrEmail)}`;

      this.emitOutput('USER_NOT_FOUND', message);
      return;
    }

    const userContext = { ...context, userId: user.id, email: user.email };
    this.logger.info(`User resolved for verification email.`, userContext);

    if (user.isVerified) {
      const message = 'User is already verified. Skipping verification email.';
      this.logger.info(message, userContext);

      const payload: UserAlreadyVerifiedPayload = { userId: user.id, email: user.email };
      this.emitOutput('USER_ALREADY_VERIFIED', payload);
      return;
    }

    let verificationToken;

    try {
      const tokens = await this.tokenRepository.findByUserId(user.id);
      verificationToken = tokens.find((token) => token.type === TokenType.VERIFICATION);

      if (!verificationToken) {
        const message = `No verification token found for user: ${user.id}`;
        this.logger.warn!(message, userContext);

        this.emitOutput('TOKEN_NOT_FOUND', message);
        return;
      }
      this.logger.debug(`Verification token found for user.`, {
        ...userContext,
        tokenId: verificationToken.id
      });
    } catch (repoError) {
      const err = repoError instanceof Error ? repoError : new Error(String(repoError));
      this.emitError(
        new OperationError(
          'REPOSITORY_ERROR',
          `Failed to retrieve tokens for user ${user.id}: ${err.message}`,
          err
        )
      );
      return;
    }

    try {
      this.logger.debug('Verifying email service availability.', userContext);
      const verifyEmailAvailability = await this.emailService.verify();
      if (!verifyEmailAvailability) {
        const message = 'Email service is currently unavailable. Cannot send verification email.';
        this.logger.error(message, userContext);

        this.emitOutput(
          'AVAILABILITY_ERROR',
          'Email service unavailable. Please try again later or contact support.'
        );
        return;
      }
      this.logger.debug('Email service is available.', userContext);
    } catch (verifyError) {
      const err = verifyError instanceof Error ? verifyError : new Error(String(verifyError));
      this.emitError(
        new OperationError(
          'EMAIL_SERVICE_VERIFY_FAILED',
          `Failed to verify email service status: ${err.message}`,
          err
        )
      );
      return;
    }

    try {
      const verificationUrl = `${this.config.server.host}/auth/verify-email?token=${verificationToken.token}`;
      const expiresInMinutes = this.config.jwt.verifyEmailExpirationMinutes;

      this.logger.debug(`Sending verification email to ${user.email}.`, userContext);

      await this.emailService.sendEmail({
        to: user.email,
        subject: '[PPL] Validate Your User Account',
        template: 'email-verification-token',
        context: {
          name: user.name,
          verificationUrl,
          expiresInMinutes: expiresInMinutes,
          currentYear: new Date().getFullYear()
        }
      });

      const successPayload: SendVerificationEmailSuccessPayload = {
        userId: user.id,
        email: user.email
      };

      this.emitSuccess(successPayload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError(
          'EMAIL_SEND_FAILED',
          `Failed to send verification email to ${user.email}: ${err.message}`,
          err
        )
      );
    }
  }

  /**
   * Resolves a user entity from input.
   * Returns null if not found or on repository error.
   * The caller (execute method) is responsible for emitting the appropriate event.
   *
   * @param userOrEmail - User object or email DTO.
   * @returns The user object or null.
   */
  private async resolveUserFromInput(
    userOrEmail: EmailUserDTO | UserResponseDTO
  ): Promise<UserResponseDTO | null> {
    const context = { operation: this.constructor.name, input: userOrEmail };

    if ('email' in userOrEmail && !('id' in userOrEmail)) {
      this.logger.debug(
        `Input is EmailUserDTO, attempting to find user by email: ${userOrEmail.email}`,
        context
      );
      try {
        const foundUser = await this.userRepository.findByEmail(userOrEmail.email);
        if (!foundUser) {
          this.logger.warn!('User not found by email for verification.', {
            ...context,
            email: userOrEmail.email
          });
          return null;
        }
        this.logger.debug(`User found by email.`, { ...context, userId: foundUser.id });
        return foundUser;
      } catch (repoError) {
        const err = repoError instanceof Error ? repoError : new Error(String(repoError));
        this.logger.error(`Error finding user by email: ${err.message}`, {
          ...context,
          email: userOrEmail.email,
          error: err
        });
        return null;
      }
    } else if ('id' in userOrEmail && 'email' in userOrEmail) {
      this.logger.debug(`Input is UserResponseDTO.`, { ...context, userId: userOrEmail.id });
      return userOrEmail;
    } else {
      this.logger.error(`Unrecognized input type for user resolution.`, context);
      return null;
    }
  }
}
