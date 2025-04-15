import status from 'http-status';
import { BaseController } from '@interface/http/controllers/base';
import { CreateUser, DeleteUser, GetAllUsers, GetUser, UpdateUser } from '@application/use_cases/user';
import { ControllerMethod, HttpNext, HttpRequest, HttpResponse } from '@interface/http/types/Http';
import { ITransformer } from '@interface/http/transformer';
import { CreateUserDTO, UpdateUserDTO } from '@enterprise/dto/input/user';
import { PaginationDTO, UserResponseDTO } from '@enterprise/dto/output';
import { DTOValidationError } from '@enterprise/dto/errors';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { ILogger } from '@application/contracts/infrastructure';
import { IUserRepository } from '@application/contracts/domain/repositories';
import { UserRole } from '@enterprise/enum';
import { Authorize } from '@interface/http/decorators';

/**
 * UserController is responsible for handling User-related HTTP requests
 * such as creating, fetching, updating, and deleting users. It integrates
 * multiple components including the repository, transformer, hasher, and logger
 * to perform business logic and send the appropriate response.
 *
 * It extends BaseController and utilizes utility methods defined there for
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
    private readonly logger: ILogger,
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
        try {
          const {
            name, email, username, password, repeatPassword, role, birthDate, gender
          } = request.body as {
            name?: string; email?: string; username?: string; password?: string; repeatPassword?: string; role?: string; birthDate?: string | Date; gender?: string;
          };

          const userData = await CreateUserDTO.validate({
            name, email, username, password, repeatPassword, role, birthDate, gender
          });

          const createUserCommand = new CreateUser(
            this.userRepository,
            this.passwordHasher,
            this.logger,
          );

          createUserCommand
            .onTyped('SUCCESS', (user) => {
              this.handleSuccess(
                response,
                this.transformer.serialize(user),
                status.CREATED
              );
            })
            .onTyped('VALIDATION_ERROR', (error) => {
              this.handleValidationError(response, error);
            })
            .onTyped('USER_EXISTS', (error) => {
              this.handleConflict(response, String(error));
            })
            .onTyped('ERROR', this.handleError(response));

          await createUserCommand.execute(userData);
        } catch (error: unknown) {
          if (error instanceof DTOValidationError) {
            this.handleValidationError(response, error.getFormattedErrors());
          }

          this.logger.error('Unexpected error in createUser', { error });
          this.handleError(response)(error);
        }
      },
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
        try {
          const getAllUsersCommand = new GetAllUsers(this.userRepository);

          const page = Math.max(1, Number(request.query?.page ?? 1));
          const limit = Math.min(100, Math.max(1, Number(request.query?.limit ?? 10)));

          getAllUsersCommand
            .onTyped('SUCCESS', (paginatedUsers: PaginationDTO<UserResponseDTO>) => {
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
            })
            .onTyped('ERROR', this.handleError(response));

          await getAllUsersCommand.execute(page, limit);
        } catch (error) {
          this.handleError(response)(error);
        }
      },
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
        try {
          const getUserCommand = new GetUser(this.userRepository);
          const { id, email } = request.params;

          if (!id && !email) {
            this.handleValidationError(response, 'User ID or email is required');
            return;
          }

          getUserCommand
            .onTyped('SUCCESS', (user: UserResponseDTO) => {
              this.handleSuccess(
                response,
                this.transformer.serialize(user),
                status.OK
              );
            })
            .onTyped('NOTFOUND_ERROR', (error) => {
              this.handleNotFound(response, String(error));
            })
            .onTyped('ERROR', this.handleError(response));

          await getUserCommand.execute(id ?? '', email ?? '');
        } catch (error) {
          this.handleError(response)(error);
        }
      },
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
        try {
          const deleteUserCommand = new DeleteUser(this.userRepository);
          const { id } = request.params;

          if (!id) {
            this.handleValidationError(response, 'User ID is required');
            return;
          }

          deleteUserCommand
            .onTyped('SUCCESS', (message) => {
              this.handleSuccess(
                response,
                { message },
                status.NO_CONTENT
              );
            })
            .onTyped('NOTFOUND_ERROR', (error) => {
              this.handleNotFound(response, String(error));
            })
            .onTyped('VALIDATION_ERROR', (error) => {
              this.handleValidationError(response, error);
            })
            .onTyped('ERROR', this.handleError(response));

          await deleteUserCommand.execute(id);
        } catch (error) {
          this.handleError(response)(error);
        }
      },
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
        try {
          const userId = request.params.id;

          if (!userId) {
            this.handleValidationError(
              response,
              'User ID is required'
            );
            return;
          }

          const updateUserCommand = new UpdateUser(
            this.userRepository,
            this.logger,
          );

          const updateData = await UpdateUserDTO.validate(request.body as Record<string, unknown>);

          updateUserCommand
            .onTyped('SUCCESS', (user) => {
              this.handleSuccess(
                response,
                this.transformer.serialize(user),
                status.OK
              );
            })
            .onTyped('VALIDATION_ERROR', (error) => {
              this.handleValidationError(response, error);
            })
            .onTyped('USER_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            })
            .onTyped('EMAIL_TAKEN', (error) => {
              this.handleConflict(response, String(error));
            })
            .onTyped('USERNAME_TAKEN', (error) => {
              this.handleConflict(response, String(error));
            })
            .onTyped('ERROR', this.handleError(response));

          await updateUserCommand.execute(userId, updateData);
        } catch (error: unknown) {
          if (error instanceof DTOValidationError) {
            this.handleValidationError(response, error.getFormattedErrors());
          }

          this.logger.error('Unexpected error in updateUser', { error });
          this.handleError(response)(error);
        }
      },
    };
  }
}
