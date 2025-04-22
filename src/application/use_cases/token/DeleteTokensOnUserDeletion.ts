import { ITokenRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { IBootstrapper } from '@application/contracts/lifecycle';
import { BaseOperationEvents, BaseOperation, OperationError } from '@application/use_cases/base';
import { UserDeletedEvent } from '@enterprise/events/user';

/**
 * Defines the payload for the SUCCESS event upon successful token deletion.
 */
type DeleteTokensSuccessPayload = {
  userId: string;
  deletedCount: number;
};

/**
 * Defines the payload for the TOKEN_NOT_FOUND event.
 */
type TokenNotFoundPayload = {
  userId: string;
};

/**
 * Defines the events specific to the DeleteTokensOnUserDeletion operation.
 * Extends BaseOperationEvents where SUCCESS payload is DeleteTokensSuccessPayload
 * and ERROR payload is OperationError.
 * Includes specific outcome events:
 * - TOKEN_NOT_FOUND: Emitted with userId when no tokens are found for the user.
 */
type DeleteTokensOnUserDeletionEvents = BaseOperationEvents<DeleteTokensSuccessPayload> & {
  TOKEN_NOT_FOUND: TokenNotFoundPayload;
};

/**
 * DeleteTokensOnUserDeletion listens for the UserDeletedEvent and removes all associated tokens.
 * Extends BaseOperation to manage events: SUCCESS, ERROR, TOKEN_NOT_FOUND.
 * Implements IBootstrapper to subscribe to the domain event upon application startup.
 *
 * @extends BaseOperation<DeleteTokensOnUserDeletionEvents>
 * @implements IBootstrapper
 */
export class DeleteTokensOnUserDeletion
  extends BaseOperation<DeleteTokensOnUserDeletionEvents>
  implements IBootstrapper
{
  constructor(
    private readonly tokenRepository: ITokenRepository,
    readonly logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'TOKEN_NOT_FOUND'], logger);
  }

  /**
   * Subscribes to the 'UserDeleted' domain event during application bootstrap.
   */
  public bootstrap(): void {
    this.subscribeTo<UserDeletedEvent>('UserDeleted', (event) => {
      this.logger.info(`Handling UserDeleted event in ${this.constructor.name}`, {
        operation: this.constructor.name,
        userId: event.userId
      });

      this.handleUserDeletion(event).catch((error) => {
        const operationError = new OperationError(
          'EVENT_HANDLER_FAILED',
          `Error handling UserDeleted event for user ${event.userId}`,
          error instanceof Error ? error : new Error(String(error))
        );
        this.logger.error(operationError.message, {
          operation: this.constructor.name,
          error: operationError.details,
          userId: event.userId
        });
      });
    });
  }

  /**
   * Handles the incoming UserDeletedEvent by logging and calling the execute method.
   * @param event - The UserDeletedEvent data.
   */
  private async handleUserDeletion(event: UserDeletedEvent): Promise<void> {
    this.logger.info('User deletion event received, preparing to delete tokens.', {
      operation: this.constructor.name,
      userId: event.userId
    });
    await this.execute(event.userId);
  }

  async execute(userId: string): Promise<void> {
    const operationName = this.constructor.name;
    const context = { operation: operationName, userId: userId };

    this.logger.info(`DeleteTokensOnUserDeletion operation started.`, context);

    try {
      this.logger.debug('Attempting to find tokens for user.', context);
      const tokensToBeDeleted = await this.tokenRepository.findByUserId(userId);

      if (!tokensToBeDeleted || tokensToBeDeleted.length === 0) {
        const message = `No tokens found for user ${userId}. No deletion necessary.`;
        this.logger.info(message, context);

        this.emitOutput('TOKEN_NOT_FOUND', { userId });
        return;
      }

      this.logger.debug(`Found ${tokensToBeDeleted.length} token(s) to delete.`, {
        ...context,
        tokenIds: tokensToBeDeleted.map((t) => t.id)
      });

      await Promise.all(tokensToBeDeleted.map((token) => this.tokenRepository.delete(token.id!)));

      const successPayload: DeleteTokensSuccessPayload = {
        userId: userId,
        deletedCount: tokensToBeDeleted.length
      };
      this.logger.info(
        `Successfully deleted ${successPayload.deletedCount} token(s) for user.`,
        context
      );
      this.emitSuccess(successPayload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const operationError = new OperationError(
        'TOKEN_DELETION_FAILED',
        `Failed to delete tokens for user ${userId}: ${err.message}`,
        err
      );
      this.emitError(operationError);
    }
  }
}
