import { Operation } from '@application/use_cases/base';
import { UserDeletedEvent } from '@enterprise/events/user';
import { ILogger } from '@application/contracts/infrastructure';
import { IBootstrapper } from '@application/contracts/lifecycle';
import { ITokenRepository } from '@application/contracts/domain/repositories';

/**
 * Represents the events that occur during the process of deleting tokens associated with a user.
 * This interface is intended to define constants for commonly occurring scenarios in token deletion.
 *
 * @interface
 */
interface DeleteTokensOnUserDeletionEvents extends Record<string, unknown> {
  TOKEN_DELETED: string;
  TOKEN_NOT_FOUND: string;
  ERROR: Error;
}

/**
 * Represents an operation that listens for user deletion events and deletes all tokens
 * associated with the user upon receiving a user deletion event.
 * This operation ensures that user tokens are effectively cleaned up to maintain data security and integrity.
 * It implements the IBootstrapper interface to support initialization and listens to events via subscription.
 *
 * Extends: Operation<DeleteTokensOnUserDeletionEvents>
 * Implements: IBootstrapper
 *
 * Events:
 * - USER_DELETED: Emitted when all tokens for a user are successfully deleted.
 * - TOKEN_NOT_FOUND: Emitted if no tokens are found for a specific user.
 * - ERROR: Emitted if an error occurs during token deletion.
 *
 * Dependencies:
 * - TokenRepository: Used to query and delete tokens for a specific user.
 * - logger: Used for logging informational and error messages.
 */
export class DeleteTokensOnUserDeletion extends Operation<DeleteTokensOnUserDeletionEvents> implements IBootstrapper{
  /**
   * Constructs an instance of the class.
   *
   * @param {ITokenRepository} TokenRepository - The repository responsible for handling token operations.
   * @param {ILogger} logger - The logger instance for logging operations and errors.
   */
  constructor(
    private TokenRepository: ITokenRepository,
    private logger: ILogger
  ) {
    super(['TOKEN_DELETED', 'TOKEN_NOT_FOUND', 'ERROR']);
  }

  /**
   * Initializes the process of subscribing to the 'UserDeleted' event.
   * When the event is received, it triggers the handling of the user deletion logic.
   * Logs appropriate messages for successful handling or errors.
   *
   * @return {void} Does not return a value.
   */
  public bootstrap(): void {
    this.subscribeTo<UserDeletedEvent>('UserDeleted', (event) => {
      this.logger.info("Handling UserDeleted event in DeleteTokensOnUserCreation");
      this.handleUserDeletion(event)
        .catch(error => {
          this.logger.error('Error handling UserDeleted event', {
            error: error instanceof Error ? error.message : String(error),
            userId: event.userId
          });
          this.emitOutput('ERROR', error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  /**
   * Handles the user deletion process by logging the event and executing related cleanup tasks, such as deleting all tokens associated with the specified user.
   *
   * @param {UserDeletedEvent} event - The event containing information about the user to be deleted, including the user ID.
   * @return {Promise<void>} A promise that resolves when the user deletion process is complete.
   */
  private async handleUserDeletion(event: UserDeletedEvent): Promise<void> {
    this.logger.info('User deletion event received, deleting all tokens from user', { userId: event.userId });
    await this.execute(event.userId);
  }

  /**
   * Executes the deletion of all tokens associated with the specified user.
   *
   * @param {string} userId - The ID of the user whose tokens should be deleted.
   * @return {Promise<void>} A promise that resolves when the token deletion process completes.
   */
  async execute(userId: string): Promise<void> {
    const { TOKEN_DELETED, TOKEN_NOT_FOUND, ERROR } = this.outputs;

    try {
      const tokensToBeDeleted = await this.TokenRepository.findByUserId(userId);

      if (!tokensToBeDeleted || tokensToBeDeleted.length === 0) {
        this.emitOutput(TOKEN_NOT_FOUND, `There are no tokens for user ${userId}`);
        return;
      }

      await Promise.all(tokensToBeDeleted.map(token => this.TokenRepository.delete(token.id!)));

      this.emitOutput(TOKEN_DELETED, 'All tokens from the user was deleted successfully');
    } catch (error) {
      this.logger.error('Error creating token', { error, userId });
      this.emitOutput(ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
