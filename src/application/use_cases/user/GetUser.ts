import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { BaseOperation, BaseOperationEvents, OperationError } from '@application/use_cases/base';
import { GetUserInputDTO } from '@enterprise/dto/input/user'; // Import the new DTO
import { UserResponseDTO } from '@enterprise/dto/output';

/**
 * Defines the events specific to the GetUser operation.
 * Extends BaseOperationEvents to include standard SUCCESS and ERROR,
 * plus a NOTFOUND_ERROR for cases where the user isn't found.
 * - SUCCESS: Emitted with the UserResponseDTO of the found user.
 * - ERROR: Emitted with an OperationError for unexpected issues.
 * - NOTFOUND_ERROR: Emitted with a string message when the user is not found.
 */
type GetUserEvents = BaseOperationEvents<UserResponseDTO> & {
  NOTFOUND_ERROR: string;
};

/**
 * Represents the use case for retrieving a single user by ID or email.
 * Extends BaseOperation to leverage-shared event handling and logging logic.
 */
export class GetUser extends BaseOperation<GetUserEvents> {
  /**
   * Constructs the GetUser use case.
   * @param {IUserRepository} userRepository - The repository for user data access.
   * @param {ILogger} logger - The logger instance for logging messages.
   */
  constructor(
    private readonly userRepository: IUserRepository,
    readonly logger: ILogger
  ) {
    // Initialize BaseOperation with the defined event names and logger
    super(['SUCCESS', 'ERROR', 'NOTFOUND_ERROR'], logger);
  }

  /**
   * Executes the process to find a user by ID or email.
   * It prioritizes finding by ID if provided, otherwise falls back to email.
   * Emits appropriate events based on the outcome (SUCCESS, NOTFOUND_ERROR, ERROR).
   *
   * @param {GetUserInputDTO} input - The input DTO containing the user's id or email.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async execute(input: GetUserInputDTO): Promise<void> {
    this.logger.info(`GetUser operation started`, { input });

    try {
      let user: UserResponseDTO | undefined | null;

      // Prioritize ID if provided
      if (input.id) {
        this.logger.info(`Attempting to find user by ID: ${input.id}`);
        user = await this.userRepository.findById(input.id);
      }

      // If not found by ID (or ID wasn't provided) and email is provided, try email
      if (!user && input.email) {
        this.logger.info(`Attempting to find user by email: ${input.email}`);
        user = await this.userRepository.findByEmail(input.email);
      }

      if (!user) {
        const criteria = input.id ? `ID ${input.id}` : `email ${input.email}`;
        const message = `User not found with the provided criteria: ${criteria}.`;
        this.logger.warn!(`GetUser failed: ${message}`, { input });
        this.emitOutput('NOTFOUND_ERROR', message);
        return;
      }

      this.logger.info(`GetUser succeeded: User found.`, { userId: user.id });
      this.emitSuccess(user);
    } catch (error) {
      this.logger.error(`GetUser failed unexpectedly.`, { input, error });
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError('GET_USER_FAILED', `Failed to retrieve user: ${err.message}`, err)
      );
    }
  }
}
