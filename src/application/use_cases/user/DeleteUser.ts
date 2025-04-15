import { Operation } from '@application/use_cases/base';
import { UserDeletedEvent } from '@enterprise/events/user';
import { IUserRepository } from '@application/contracts/domain/repositories';

/**
 * Interface representing a collection of events related to deleting a user.
 * Extends the Record type with a string key and unknown value.
 *
 * @interface DeleteUserEvents
 * @property {string} SUCCESS - Indicates a successful user deletion event.
 * @property {Error} ERROR - Represents a general error that occurred during the deletion process.
 * @property {string} NOTFOUND_ERROR - Specifies an error when the user to be deleted is not found.
 * @property {string} VALIDATION_ERROR - Represents an error due to validation failure during the deletion process.
 */
interface DeleteUserEvents extends Record<string, unknown> {
  SUCCESS: string;
  ERROR: Error;
  NOTFOUND_ERROR: string;
  VALIDATION_ERROR: string;
}

/**
 * Operation to delete a user
 */
export class DeleteUser extends Operation<DeleteUserEvents> {
  constructor(private UserRepository: IUserRepository) {
    super(['SUCCESS', 'ERROR', 'NOTFOUND_ERROR', 'VALIDATION_ERROR']);
  }

  /**
   * Executes the deletion process for a user with the specified ID.
   *
   * @param {string} id - The unique identifier of the user to be deleted.
   * @return {Promise<void>} A promise that resolves when the operation is complete.
   */
  async execute(id: string): Promise<void> {
    const { SUCCESS, ERROR, NOTFOUND_ERROR, VALIDATION_ERROR } = this.outputs;

    try {
      if (!id) {
        this.emitOutput(VALIDATION_ERROR, 'User ID is required');
        return;
      }

      const userToBeDeleted = await this.UserRepository.findById(id);

      if (!userToBeDeleted || !userToBeDeleted.id) {
        this.emitOutput(NOTFOUND_ERROR, `User with id of ${id} was not found`);
        return;
      }

      this.publishDomainEvent(new UserDeletedEvent(userToBeDeleted.id));

      await this.UserRepository.delete(userToBeDeleted.id);
      this.emitOutput(SUCCESS, 'Deletion was successful');
    } catch (error) {
      this.emitOutput(ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
