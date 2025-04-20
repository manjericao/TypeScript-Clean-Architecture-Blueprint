import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { BaseOperation, BaseOperationEvents, OperationError } from '@application/use_cases/base';
import { GetUserInputDTO } from '@enterprise/dto/input/user';
import { UserResponseDTO } from '@enterprise/dto/output';
import { UserDeletedEvent } from '@enterprise/events/user';

/**
 * Extends the standard BaseOperationEvents using a type alias to include
 * specific error scenarios for the DeleteUser operation.
 * - SUCCESS: Emitted on successful deletion (payload: success message string).
 * - ERROR: Emitted for unexpected errors (payload: OperationError).
 * - NOTFOUND_ERROR: Emitted when the user to be deleted is not found (payload: error message string).
 * - VALIDATION_ERROR: Emitted when the input ID is invalid (payload: error message string).
 */
type DeleteUserEvents = BaseOperationEvents<string> & {
  NOTFOUND_ERROR: string;
};

/**
 * Represents an operation to delete a user.
 * This class is responsible for handling the deletion logic, including validation,
 * user retrieval, event publishing, and logging related to the operation.
 * If the operation encounters a failure, appropriate events or errors will be emitted.
 *
 * Extends the `BaseOperation` class, which provides support for event handling and error management.
 *
 * Events emitted by this operation:
 * - SUCCESS: Indicates successful completion of the user deletion.
 * - ERROR: Indicates a general error occurred during the operation.
 * - NOTFOUND_ERROR: Emitted when the specified user ID does not exist.
 * - VALIDATION_ERROR: Emitted when input validation fails, such as when the user ID is missing.
 */
export class DeleteUser extends BaseOperation<DeleteUserEvents> {
  constructor(
    private readonly userRepository: IUserRepository,
    readonly logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'NOTFOUND_ERROR'], logger);
  }

  /**
   * Executes the user deletion process.
   *
   * @param {GetUserInputDTO} input - The DTO containing the ID of the user to be deleted.
   * @return {Promise<void>} A promise that resolves when the user deletion process is complete.
   */
  async execute(input: GetUserInputDTO): Promise<void> {
    try {
      const id = input.id!;

      const userToBeDeleted: UserResponseDTO | undefined = await this.userRepository.findById(id);

      if (!userToBeDeleted || !userToBeDeleted.id) {
        const message = `User with id ${id} was not found.`;
        this.logger.warn!(`DeleteUser failed: User not found.`, { userId: id });

        this.emitOutput('NOTFOUND_ERROR', message);
        return;
      }

      this.publishDomainEvent(new UserDeletedEvent(userToBeDeleted.id));
      this.logger.info(`Published UserDeletedEvent for user ${id}.`);

      await this.userRepository.delete(userToBeDeleted.id);
      this.logger.info(`Successfully deleted user ${id} from repository.`);

      const successMessage = `User with id ${id} was successfully deleted.`;
      this.emitSuccess(successMessage);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(new OperationError('DELETE_USER_FAILED', err.message, err));
    }
  }
}
