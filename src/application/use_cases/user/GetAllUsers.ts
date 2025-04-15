import { UserResponseDTO, PaginationDTO } from '@enterprise/dto/output';
import { IUserRepository } from '@application/contracts/domain/repositories';
import { BaseOperation, BaseOperationEvents, OperationError } from '@application/use_cases/base';
import { ILogger } from '@application/contracts/infrastructure';
import { Error } from 'mongoose';
import { GetAllUsersInputDTO } from '@enterprise/dto/input/user';

type GetAllUsersEvents = BaseOperationEvents<PaginationDTO<UserResponseDTO>>;

export class GetAllUsers extends BaseOperation<GetAllUsersEvents> {

  constructor(
    private UserRepository: IUserRepository,
    readonly logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR'], logger);
  }

  /**
   * Execute the operation to retrieve all users
   */
  async execute(params: GetAllUsersInputDTO): Promise<void> {
    try {
      const users = await this.UserRepository.findAll(params.page, params.limit);
      this.emitSuccess(users);
    } catch (error) {
      this.emitError(new OperationError(
        'GET_USERS_ERROR',
        error instanceof Error ? error.message : 'Unknown error occurred',
        error
      ));
    }
  }
}
