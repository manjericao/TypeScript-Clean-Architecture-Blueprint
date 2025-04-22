import { ITokenRepository } from '@application/contracts/domain/repositories';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IBootstrapper } from '@application/contracts/lifecycle';
import { ITokenGenerator } from '@application/contracts/security/authentication';
import { BaseOperation, BaseOperationEvents, OperationError } from '@application/use_cases/base';
import { CreateTokenDTO } from '@enterprise/dto/input/token';
import { TokenResponseDTO, UserResponseDTO } from '@enterprise/dto/output';
import { TokenType } from '@enterprise/enum';
import { TokenCreatedEvent } from '@enterprise/events/token';
import { UserCreatedEvent } from '@enterprise/events/user';

/**
 * Defines the payload for the SUCCESS event upon successful token creation.
 * Contains the user and the newly created token DTO.
 */
type CreateTokenSuccessPayload = {
  user: UserResponseDTO;
  createdToken: TokenResponseDTO;
};

/**
 * Defines the events specific to the CreateTokenOnUserCreation operation.
 * Extends BaseOperationEvents where SUCCESS payload is CreateTokenSuccessPayload
 * and ERROR payload is OperationError.
 */
type CreateTokenOnUserCreationEvents = BaseOperationEvents<CreateTokenSuccessPayload>;

/**
 * CreateTokenOnUserCreation listens for the UserCreatedEvent and generates
 * a verification token for the newly created user.
 * Extends BaseOperation to manage events: SUCCESS, ERROR.
 * Implements IBootstrapper to subscribe to the domain event upon application startup.
 *
 * @extends BaseOperation<CreateTokenOnUserCreationEvents>
 * @implements IBootstrapper
 */
export class CreateTokenOnUserCreation
  extends BaseOperation<CreateTokenOnUserCreationEvents>
  implements IBootstrapper
{
  constructor(
    private readonly tokenRepository: ITokenRepository,
    private readonly tokenGenerator: ITokenGenerator,
    private readonly config: IConfig,
    readonly logger: ILogger // Make logger readonly and accessible
  ) {
    // Pass standard events and logger to the base class constructor
    super(['SUCCESS', 'ERROR'], logger);
  }

  /**
   * Subscribes to the 'UserCreated' domain event during application bootstrap.
   */
  public bootstrap(): void {
    this.subscribeTo<UserCreatedEvent>('UserCreated', (event) => {
      this.logger.info(`Handling UserCreated event in ${this.constructor.name}`, {
        operation: this.constructor.name,
        userId: event.user.id
      });

      this.handleUserCreated(event).catch((error) => {
        const operationError = new OperationError(
          'EVENT_HANDLER_FAILED',
          `Error handling UserCreated event for user ${event.user.id}`,
          error instanceof Error ? error : new Error(String(error))
        );

        this.logger.error(operationError.message, {
          operation: this.constructor.name,
          error: operationError.details,
          userId: event.user.id
        });
      });
    });
  }

  /**
   * Handles the incoming UserCreatedEvent by logging and calling the execute method.
   * @param event - The UserCreatedEvent data.
   */
  private async handleUserCreated(event: UserCreatedEvent): Promise<void> {
    this.logger.info('User created event received, preparing to create verification token.', {
      operation: this.constructor.name,
      userId: event.user.id
    });

    await this.execute(event.user);
  }

  /**
   * Executes the token creation logic.
   * @param user - The UserResponseDTO for whom to create the token.
   */
  async execute(user: UserResponseDTO): Promise<void> {
    const operationName = this.constructor.name;
    const context = { operation: operationName, userId: user.id };

    this.logger.info(`${operationName} operation started.`, context);

    try {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + this.config.jwt.accessExpirationMinutes * 60 * 1000
      );

      const expirationInSeconds = this.config.jwt.accessExpirationMinutes * 60;
      const tokenString = this.tokenGenerator.generateToken(
        TokenType.VERIFICATION,
        expirationInSeconds
      );

      const tokenData: CreateTokenDTO = {
        userId: user.id,
        token: tokenString,
        type: TokenType.VERIFICATION,
        expiresAt,
        isRevoked: false
      };

      this.logger.debug('Attempting to create verification token in repository.', context);
      const createdToken = await this.tokenRepository.create(tokenData);

      const successPayload: CreateTokenSuccessPayload = {
        user: user,
        createdToken: createdToken
      };

      this.logger.info('Verification token created successfully.', {
        ...context,
        tokenId: createdToken.id,
        tokenType: createdToken.type
      });

      this.publishDomainEvent(new TokenCreatedEvent(user));

      this.emitSuccess(successPayload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const operationError = new OperationError(
        'TOKEN_CREATION_FAILED',
        `Failed to create verification token for user ${user.id}: ${err.message}`,
        err
      );
      this.emitError(operationError);
    }
  }
}
