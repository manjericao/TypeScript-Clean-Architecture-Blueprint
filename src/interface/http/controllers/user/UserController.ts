import status from 'http-status';

import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import {
  CreateUser,
  DeleteUser,
  GetAllUsers,
  GetUser,
  UpdateUser
} from '@application/use_cases/user';
import {
  CreateUserDTO,
  UpdateUserDTO,
  GetAllUsersInputDTO,
  GetUserInputDTO
} from '@enterprise/dto/input/user';
import { PaginationDTO, UserResponseDTO } from '@enterprise/dto/output';
import { UserRole } from '@enterprise/enum';
import {
  ControllerMethod,
  HttpNext,
  HttpRequest,
  HttpResponse
} from '@interface/http/adapters/Http';
import { BaseController } from '@interface/http/controllers/base';
import { Authorize } from '@interface/http/decorators';
import { ITransformer } from 'src/application/contracts/transformer';

/**
 * UserController is responsible for handling User-related HTTP requests
 * such as creating, fetching, updating, and deleting users. It integrates
 * multiple components including the repository, transformer, hasher, and logger
 * to perform business logic and send the appropriate response.
 *
 * It extends BaseController and uses utility methods defined there for
 * consistent error handling, validation, and success response formatting.
 *
 * Dependencies:
 * - userRepository: interface managing data persistence and retrieval for users.
 * - transformer: transforms input data and serializes output data.
 * - passwordHasher: hashes and validates user passwords.
 * - logger: logs system operations and errors.
 */
export class UserController extends BaseController {
  /**
   * Constructs an instance of the class with dependencies injected.
   *
   * @param {IUserRepository} userRepository - The repository interface for managing user data.
   * @param {ITransformer} transformer - The transformer used for data manipulation.
   * @param {IPasswordHasher} passwordHasher - The service responsible for hashing passwords.
   * @param {ILogger} logger - The logging service for logging operations.
   */
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly transformer: ITransformer,
    private readonly passwordHasher: IPasswordHasher,
    private readonly logger: ILogger
  ) {
    super();
  }

  /**
   * Creates a controller method for handling user creation.
   *
   * The created controller method processes the HTTP request to create a new user.
   * It validates the user data, executes the user creation logic, and handles
   * various outcomes such as successful user creation, validation errors,
   * user conflicts, or unexpected errors.
   *
   * @return An object containing the controller method `_createUser` which executes
   *         the user creation logic.
   */
  public createUser(): { _createUser: ControllerMethod } {
    return {
      _createUser: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const userData = await CreateUserDTO.validate(request.body as Record<string, unknown>);

            const createUserCommand = new CreateUser(
              this.userRepository,
              this.passwordHasher,
              this.logger
            );

            createUserCommand.on('SUCCESS', (user) => {
              this.handleSuccess(response, this.transformer.serialize(user), status.CREATED);
            });
            createUserCommand.on('VALIDATION_ERROR', (error) => {
              this.handleValidationError(response, error);
            });
            createUserCommand.on('USER_EXISTS', (error) => {
              this.handleConflict(response, String(error));
            });
            createUserCommand.on('ERROR', this.handleError(response));

            await createUserCommand.execute(userData);
          },
          this.logger
        );
      }
    };
  }

  /**
   * Retrieves a controller method for handling the 'Get All Users' operation.
   *
   * @return {Object} An object containing the `_getAllUsers` method, which is an asynchronous
   * controller method responsible for processing requests to fetch a paginated list of users.
   * The method handles success and error scenarios and formats the response appropriately.
   */
  @Authorize([UserRole.ADMIN, UserRole.USER])
  public getAllUsers(): { _getAllUsers: ControllerMethod } {
    return {
      _getAllUsers: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const page = Math.max(1, Number(request.query?.page ?? 1));
            const limit = Math.min(100, Math.max(1, Number(request.query?.limit ?? 10)));

            const paginationInput = await GetAllUsersInputDTO.validate({ page, limit });

            const getAllUsersCommand = new GetAllUsers(this.userRepository, this.logger);

            getAllUsersCommand.on('SUCCESS', (paginatedUsers: PaginationDTO<UserResponseDTO>) => {
              this.handleSuccess(
                response,
                {
                  body: this.transformer.serialize(paginatedUsers.body),
                  page: paginatedUsers.page,
                  limit: paginatedUsers.limit,
                  total: paginatedUsers.total,
                  last_page: Math.ceil(paginatedUsers.total / limit)
                },
                status.OK
              );
            });
            getAllUsersCommand.on('ERROR', this.handleError(response));

            await getAllUsersCommand.execute(paginationInput);
          },
          this.logger
        );
      }
    };
  }

  /**
   * Retrieves a user based on the provided user ID or email.
   *
   * @return An object containing a controller method `_getUser` that handles HTTP requests
   *         to retrieve user data. The method processes request parameters, validates input,
   *         and triggers appropriate responses based on the success or failure of the user retrieval operation.
   */
  @Authorize([UserRole.ADMIN, UserRole.USER])
  public getUser(): { _getUser: ControllerMethod } {
    return {
      _getUser: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const userInput = await GetUserInputDTO.validate(
              request.params as Record<string, unknown>
            );

            const getUserCommand = new GetUser(this.userRepository, this.logger);

            getUserCommand.on('SUCCESS', (user: UserResponseDTO) => {
              this.handleSuccess(response, this.transformer.serialize(user), status.OK);
            });
            getUserCommand.on('NOTFOUND_ERROR', (error: string | Error) => {
              this.handleNotFound(response, error instanceof Error ? error.message : String(error));
            });
            getUserCommand.on('ERROR', this.handleError(response));

            await getUserCommand.execute(userInput);
          },
          this.logger
        );
      }
    };
  }

  /**
   * Removes a user based on the provided user ID in the request parameters.
   * Handles success, validation errors, not found errors, and general execution errors.
   *
   * @return {object} An object containing the `_removeUser` method, which executes the user removal process.
   */
  @Authorize([UserRole.ADMIN])
  public removeUser(): { _removeUser: ControllerMethod } {
    return {
      _removeUser: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const userInput = await GetUserInputDTO.validate({ id: request.params.id } as Record<
              string,
              unknown
            >);

            const deleteUserCommand = new DeleteUser(this.userRepository, this.logger);

            deleteUserCommand.on('SUCCESS', (message) => {
              this.handleSuccess(response, message, status.NO_CONTENT);
            });
            deleteUserCommand.on('NOTFOUND_ERROR', (error) => {
              this.handleNotFound(response, String(error));
            });
            deleteUserCommand.on('ERROR', this.handleError(response));

            await deleteUserCommand.execute(userInput);
          },
          this.logger
        );
      }
    };
  }

  /**
   * Updates a user's information based on the provided user ID and request body.
   * Handles validation, updates the user data, and responds accordingly with success
   * or error messages.
   *
   * @return {object} An object containing the `_updateUser` method, which processes
   * the user update functionality. The `_updateUser` method handles various scenarios
   * such as validation errors, user not found, conflicting data, and unexpected errors.
   */
  @Authorize([UserRole.ADMIN])
  public updateUser(): { _updateUser: ControllerMethod } {
    return {
      _updateUser: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const userInput = await GetUserInputDTO.validate({ id: request.params.id } as Record<
              string,
              unknown
            >);

            const updateData = await UpdateUserDTO.validate(
              request.body as Record<string, unknown>
            );

            const updateUserCommand = new UpdateUser(this.userRepository, this.logger);

            updateUserCommand.on('SUCCESS', (user) => {
              this.handleSuccess(response, this.transformer.serialize(user), status.OK);
            });
            updateUserCommand.on('USER_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            });
            updateUserCommand.on('EMAIL_TAKEN', (error) => {
              this.handleConflict(response, String(error));
            });
            updateUserCommand.on('USERNAME_TAKEN', (error) => {
              this.handleConflict(response, String(error));
            });
            updateUserCommand.on('ERROR', this.handleError(response));

            await updateUserCommand.execute(userInput, updateData);
          },
          this.logger
        );
      }
    };
  }
}
