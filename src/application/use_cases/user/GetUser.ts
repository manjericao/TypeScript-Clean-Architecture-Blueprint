import { Operation } from '@application/use_cases/base';
import { UserResponseDTO } from '@enterprise/dto/output';
import { IUserRepository } from '@application/contracts/domain/repositories';

/**
 * Represents the structure for user-related event responses.
 * This interface is used to handle different outcomes for a user-specific event,
 * including success, error, and not found scenarios.
 *
 * @interface GetUserEvents
 * @extends {Record<string, unknown>}
 *
 * @property {UserResponseDTO} SUCCESS - Represents the successful outcome of the event,
 * containing the user-specific data transfer object.
 *
 * @property {Error} ERROR - Represents a generic error outcome for the event.
 *
 * @property {string} NOTFOUND_ERROR - Represents a specific error outcome indicating
 * that the requested user was not found.
 */
interface GetUserEvents extends Record<string, unknown> {
  SUCCESS: UserResponseDTO;
  ERROR: Error;
  NOTFOUND_ERROR: string;
}

/**
 * Class responsible for retrieving user information based on an identifier or email.
 * Emits appropriate events depending on the outcome of the operation.
 *
 * Inherits from a generic Operation class.
 */
export class GetUser extends Operation<GetUserEvents> {
  /**
   * @param UserRepository Repository dependencies
   */
  constructor(private UserRepository: IUserRepository) {
    super(['SUCCESS', 'ERROR', 'NOTFOUND_ERROR']);
  }

  /**
   * Executes a user lookup based on the provided id or email.
   * Emits success or error events based on the operation result.
   *
   * @param {string} id - The unique identifier of the user to look up.
   * @param {string} email - The email address of the user to look up.
   * @return {Promise<void>} - A promise that resolves when the operation completes.
   */
  async execute(id: string, email: string): Promise<void> {
    const { SUCCESS, ERROR, NOTFOUND_ERROR } = this.outputs;
    try {
      let user: UserResponseDTO | undefined;

      if (id) {
        user = await this.UserRepository.findById(id);
      }

      if (!user && email) {
        user = await this.UserRepository.findByEmail(email);
      }

      if (!user || (Object.keys(user).length === 0 && user.constructor === Object)) {
        this.emitOutput(NOTFOUND_ERROR, 'User was not found');
        return;
      }

      this.emitOutput(SUCCESS, user);
    } catch (error) {
      this.emitOutput(ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
