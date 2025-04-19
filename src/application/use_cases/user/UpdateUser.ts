import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { BaseOperation, BaseOperationEvents, OperationError } from '@application/use_cases/base';
import { GetUserInputDTO, UpdateUserDTO } from '@enterprise/dto/input/user';
import { UserResponseDTO } from '@enterprise/dto/output';

/**
 * Defines the events specific to the UpdateUser operation.
 * Extends BaseOperationEvents to include standard SUCCESS and ERROR,
 * plus specific failure cases like USER_NOT_FOUND, EMAIL_TAKEN, and USERNAME_TAKEN.
 * - SUCCESS: Emitted with the UserResponseDTO of the updated user.
 * - ERROR: Emitted with an OperationError for unexpected issues.
 * - USER_NOT_FOUND: Emitted with a string message when the user to update is not found.
 * - EMAIL_TAKEN: Emitted with a string message when the desired email is already in use by another user.
 * - USERNAME_TAKEN: Emitted with a string message when another user already takes the desired username.
 */
type UpdateUserEvents = BaseOperationEvents<UserResponseDTO> & {
  USER_NOT_FOUND: string;
  EMAIL_TAKEN: string;
  USERNAME_TAKEN: string;
};

/**
 * UpdateUser is a class responsible for handling the user update process.
 * It includes validation, checks for conflicts such as existing email or username on other users,
 * and triggers the necessary events on completion.
 * Extends BaseOperation to manage events such as SUCCESS, ERROR, USER_NOT_FOUND, EMAIL_TAKEN, and USERNAME_TAKEN.
 *
 * @extends BaseOperation<UpdateUserEvents>
 */
export class UpdateUser extends BaseOperation<UpdateUserEvents> {
  constructor(
    private readonly userRepository: IUserRepository,
    readonly logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'USER_NOT_FOUND', 'EMAIL_TAKEN', 'USERNAME_TAKEN'], logger);
  }

  /**
   * Executes the update operation for a user with the provided inputs.
   *
   * @param {GetUserInputDTO} user - The input DTO containing details of the user to be updated.
   * @param {UpdateUserDTO} updates - The DTO specifying the fields to update for the user.
   * @return {Promise<void>} A promise that resolves when the operation is completed, whether successful or failed.
   */
  async execute(user: GetUserInputDTO, updates: UpdateUserDTO): Promise<void> {
    const userId = user.id!;
    this.logger.info(`UpdateUser operation started for userId: ${userId}`, {
      userId,
      input: updates
    });

    try {
      this.logger.debug(`Checking if user exists`, { userId });

      const existingUser = await this.userRepository.findById(userId);
      if (!existingUser) {
        const message = `User with id ${userId} not found.`;
        this.logger.warn!(`UpdateUser failed: ${message}`, { userId }); // Add { userId } as second arg

        this.emitOutput('USER_NOT_FOUND', message);
        return;
      }

      if (updates.email && updates.email !== existingUser.email) {
        this.logger.debug(`Checking for conflicting email: ${updates.email}`, { userId });
        const emailExists = await this.userRepository.findByEmail(updates.email);
        if (emailExists && emailExists.id !== userId) {
          const message = `Email ${updates.email} is already in use.`;
          this.logger.warn!(`UpdateUser failed: ${message}`, { userId });

          this.emitOutput('EMAIL_TAKEN', message);
          return;
        }
      }

      if (updates.username && updates.username !== existingUser.username) {
        this.logger.debug(`Checking for conflicting username: ${updates.username}`, { userId });
        const usernameExists = await this.userRepository.findByUsername(updates.username);
        if (usernameExists && usernameExists.id !== userId) {
          const message = `Username ${updates.username} is already taken.`;
          this.logger.warn!(`UpdateUser failed: Username already taken.`, {
            userId,
            username: updates.username
          });

          this.emitOutput('USERNAME_TAKEN', message);
          return;
        }
      }

      this.logger.debug(`Attempting to update user in repository`, { userId, updates });
      const updatedUser: UserResponseDTO = await this.userRepository.update(userId, updates);

      this.logger.info(`UpdateUser succeeded: User updated.`, { userId: updatedUser.id });
      this.emitSuccess(updatedUser);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError('UPDATE_USER_FAILED', `Failed to update user: ${err.message}`, err)
      );
    }
  }
}
