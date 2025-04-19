import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { BaseOperation, BaseOperationEvents, OperationError } from '@application/use_cases/base';
import { GetAllUsersInputDTO } from '@enterprise/dto/input/user';
import { UserResponseDTO, PaginationDTO } from '@enterprise/dto/output';

/**
 * Represents the events associated with retrieving all users.
 * This type extends the base operation events and is specifically
 * tailored to handle events related to paginated user data.
 *
 * The generic parameters indicate the structure of the events as
 * they relate to pagination and user response details.
 *
 * - `PaginationDTO<UserResponseDTO>`: Defines the paginated response
 *   structure with user-related data.
 *
 * Extends:
 * - BaseOperationEvents: Provides a base structure for operation-related
 *   event handling.
 */
type GetAllUsersEvents = BaseOperationEvents<PaginationDTO<UserResponseDTO>>;

/**
 * Class representing the operation to retrieve all users.
 * Extends the BaseOperation class to handle predefined operation events.
 */
export class GetAllUsers extends BaseOperation<GetAllUsersEvents> {
  constructor(
    private UserRepository: IUserRepository,
    readonly logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR'], logger);
  }

  /**
   * Executes the process to retrieve all users based on the provided input parameters.
   * It fetches the user data and handles success or error scenarios accordingly.
   *
   * @param {GetAllUsersInputDTO} getAllUserParams - The input parameters, including pagination details (page and limit).
   * @return {Promise<void>} A promise that resolves when the operation is complete.
   */
  async execute(getAllUserParams: GetAllUsersInputDTO): Promise<void> {
    try {
      const users = await this.UserRepository.findAll(
        getAllUserParams.page,
        getAllUserParams.limit
      );
      this.emitSuccess(users);
    } catch (error) {
      this.emitError(
        new OperationError(
          'GET_USERS_ERROR',
          error instanceof Error ? error.message : 'Unknown error occurred',
          error
        )
      );
    }
  }
}
