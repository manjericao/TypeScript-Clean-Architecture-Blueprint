import { Operation } from '@application/use_cases/base';
import { UserCreatedEvent } from '@enterprise/events/user';
import { TokenType } from '@enterprise/enum';
import { CreateTokenDTO } from '@enterprise/dto/input/token';
import { TokenCreatedEvent } from '@enterprise/events/token';
import { UserResponseDTO } from '@enterprise/dto/output';
import { IBootstrapper } from '@application/contracts/lifecycle';
import { ITokenGenerator } from '@application/contracts/security/authentication';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository } from '@application/contracts/domain/repositories';

/**
 * Interface representing the events related to token creation during user creation processes.
 * Extends a generic record to allow additional flexible properties.
 *
 * @interface CreateTokenUserCreationEvents
 *
 * @property {Object} TOKEN_CREATED - Event triggered when a token is successfully created.
 * @property {UserResponseDTO} TOKEN_CREATED.user - Details of the user for whom the token was created.
 *
 * @property {Error} ERROR - Event triggered when an error occurs during the token creation process.
 */
interface CreateTokenUserCreationEvents extends Record<string, unknown> {
  TOKEN_CREATED: { user: UserResponseDTO };
  ERROR: Error;
}

/**
 * The `CreateTokenOnUserCreation` class handles the generation of a verification token
 * upon the creation of a new user. It listens to the `UserCreated` domain event and
 * triggers the process of token generation and storage, while emitting appropriate
 * outputs for success and error cases.
 *
 * This class extends the `Operation` base class to manage the flow of the operation
 * with specified output events and implements the `IBootstrapper` interface to initialize
 * the event subscription during application startup.
 */
export class CreateTokenOnUserCreation extends Operation<CreateTokenUserCreationEvents> implements IBootstrapper{
  /**
   * Constructs an instance of the class with the required dependencies.
   *
   * @param {ITokenRepository} TokenRepository - Repository for managing token operations.
   * @param {ITokenGenerator} GenerateToken - Service for generating tokens.
   * @param {IConfig} config - Configuration settings for the application.
   * @param {ILogger} logger - Logger for logging application events and errors.
   */
  constructor(
    private TokenRepository: ITokenRepository,
    private GenerateToken: ITokenGenerator,
    private config: IConfig,
    private logger: ILogger
  ) {
    super(['TOKEN_CREATED', 'ERROR']);
  }

  /**
   * Initializes subscriptions for relevant domain events and sets up appropriate handlers.
   * Specifically, subscribes to the "UserCreated" event and processes it using the handleUserCreated method.
   * Logs information, handles errors, and emits an "ERROR" status in case of failure during processing.
   *
   * @return {void} No return value.
   */
  public bootstrap(): void {
    this.subscribeTo<UserCreatedEvent>('UserCreated', (event) => {
      this.logger.info("Handling UserCreated event in CreateTokenOnUserCreation");
      this.handleUserCreated(event)
        .catch(error => {
          this.logger.error('Error handling UserCreated event', {
            error: error instanceof Error ? error.message : String(error),
            userId: event.user.id
          });
          this.emitOutput('ERROR', error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  /**
   * Handles the UserCreatedEvent by logging the event and performing further actions
   * such as generating a token for the created user.
   *
   * @param {UserCreatedEvent} event - The event data that contains information about the created user.
   * @return {Promise<void>} A promise that resolves once the processing of the event is complete.
   */
  private async handleUserCreated(event: UserCreatedEvent): Promise<void> {
    this.logger.info('User created event received, generating token', { userId: event.user.id });
    await this.execute(event.user);
  }

  /**
   * Executes the token creation process for a user. Generates a verification token,
   * saves it in the repository, and triggers necessary domain events.
   *
   * @param {UserResponseDTO} user - The user data transfer object containing user details.
   * @return {Promise<void>} A promise representing the completion of the token creation process.
   */
  async execute(user: UserResponseDTO): Promise<void> {
    const { TOKEN_CREATED, ERROR } = this.outputs;

    try {
      const expiresAt = new Date();
      expiresAt.setHours(this.config.jwt.accessExpirationMinutes);

      const tokenString = this.GenerateToken.generateToken(TokenType.VERIFICATION, this.config.jwt.accessExpirationMinutes);

      const tokenData: CreateTokenDTO = {
        userId: user.id,
        token: tokenString,
        type: TokenType.VERIFICATION,
        expiresAt,
        isRevoked: false
      };

      const createdToken = await this.TokenRepository.create(tokenData);

      this.logger.info('Token created successfully', {
        userId: user.id,
        tokenId: createdToken.id,
        tokenType: createdToken.type
      });

      this.publishDomainEvent(new TokenCreatedEvent(user));

      this.emitOutput(TOKEN_CREATED, {
        user
      });
    } catch (error) {
      this.logger.error('Error creating token', { error, userId: user.id });
      this.emitOutput(ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
