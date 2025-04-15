import { Operation } from '@application/use_cases/base';
import { UserResponseDTO } from '@enterprise/dto/output';
import { validate } from 'class-validator';
import { UpdateUserDTO } from '@enterprise/dto/input/user';
import { ILogger } from '@application/contracts/infrastructure';
import { IUserRepository } from '@application/contracts/domain/repositories';

/**
 * Interface representing the events related to user updates.
 * This interface extends a generalized record structure to map event keys to their associated values.
 * It provides a standardized way to handle various outcomes of user updates.
 *
 * @interface UpdateUserEvents
 */
interface UpdateUserEvents extends Record<string, unknown> {
  SUCCESS: UserResponseDTO;
  ERROR: Error;
  VALIDATION_ERROR: string;
  USER_NOT_FOUND: string;
  EMAIL_TAKEN: string;
  USERNAME_TAKEN: string;
}

/**
 * The UpdateUser class is responsible for handling the updating of existing user accounts.
 * It extends the Operation class and uses dependencies such as IUserRepository for managing
 * user-related operations.
 */
export class UpdateUser extends Operation<UpdateUserEvents> {

  /**
   * Constructs an instance of the class.
   *
   * @param {IUserRepository} UserRepository - The repository for user data operations.
   * @param {ILogger} logger - The logging service for recording events and errors.
   */
  constructor(private UserRepository: IUserRepository, private logger: ILogger) {
    super(['SUCCESS', 'ERROR', 'VALIDATION_ERROR', 'USER_NOT_FOUND', 'EMAIL_TAKEN', 'USERNAME_TAKEN']);
  }

  /**
   * Executes the user update process. Validates the input, checks for the existence of the user,
   * verifies that email and username aren't taken by other users, and updates the user in the repository.
   * Emits specific outputs based on the operation's result.
   *
   * @param {string} userId - The ID of the user to update.
   * @param {UpdateUserDTO} updates - An object containing the user details to update.
   * @return {Promise<void>} A promise that resolves when the process is complete.
   */
  async execute(userId: string, updates: UpdateUserDTO): Promise<void> {
    const { SUCCESS, ERROR, VALIDATION_ERROR, USER_NOT_FOUND, EMAIL_TAKEN, USERNAME_TAKEN } = this.outputs;

    try {
      this.logger.info('Updating user', { userId });

      const errors = await validate(updates);
      if (errors.length > 0) {
        this.emitOutput(VALIDATION_ERROR, errors);
        return;
      }

      const existingUser = await this.UserRepository.findById(userId);
      if (!existingUser) {
        this.emitOutput(USER_NOT_FOUND, `User with id ${userId} not found`);
        return;
      }

      if (updates.email && updates.email !== existingUser.email) {
        const emailExists = await this.UserRepository.findByEmail(updates.email);
        if (emailExists && emailExists.id !== userId) {
          this.emitOutput(EMAIL_TAKEN, `Email ${updates.email} is already in use`);
          return;
        }
      }

      if (updates.username && updates.username !== existingUser.username) {
        const usernameExists = await this.UserRepository.findByUsername(updates.username);
        if (usernameExists && usernameExists.id !== userId) {
          this.emitOutput(USERNAME_TAKEN, `Username ${updates.username} is already taken`);
          return;
        }
      }

      const updatedUser = await this.UserRepository.update(userId, updates);
      this.logger.info('User updated successfully', { userId });

      this.emitOutput(SUCCESS, updatedUser);
    } catch (error) {
      this.emitOutput(ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
