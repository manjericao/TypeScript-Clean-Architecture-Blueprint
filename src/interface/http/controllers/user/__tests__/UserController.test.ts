import { status } from 'http-status';
import { UserController } from '../UserController';
import { CreateUser, DeleteUser, GetAllUsers, GetUser, UpdateUser } from '@application/use_cases/user';
import { HttpRequest, HttpResponse } from '@interface/http/types/Http';
import { Gender, UserRole } from '@enterprise/enum';
import { ITransformer } from '@interface/http/transformer';
import { CreateUserDTO, UpdateUserDTO } from '@enterprise/dto/input/user';
import { PaginationDTO, UserResponseDTO } from '@enterprise/dto/output';
import { faker } from '@faker-js/faker';
import { DTOValidationError } from '@enterprise/dto/errors';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { ILogger } from '@application/contracts/infrastructure';
import { IUserRepository } from '@application/contracts/domain/repositories';

jest.mock('@application/use_cases/user/GetAllUsers');
jest.mock('@application/use_cases/user/GetUser');
jest.mock('@application/use_cases/user/DeleteUser');
jest.mock('@application/use_cases/user/CreateUser');
jest.mock('@application/use_cases/user/UpdateUser');

describe('UserController', () => {
  let userController: UserController;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockTransformer: jest.Mocked<ITransformer>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockRequest: Partial<HttpRequest>;
  let mockResponse: Partial<HttpResponse>;
  let mockNext: jest.Mock;
  let mockJsonFn: jest.Mock;
  let mockStatusFn: jest.Mock;
  let mockCreateUserInstance: jest.Mocked<CreateUser>;
  let mockGetAllUsersInstance: jest.Mocked<GetAllUsers>;
  let mockGetUserInstance: jest.Mocked<GetUser>;
  let mockDeleteUserInstance: jest.Mocked<DeleteUser>;

  const mockUser = {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    username: faker.internet.username(),
    role: UserRole.USER,
    birthDate: new Date(),
    gender: Gender.MALE,
    isVerified: false,
  };

  const mockCreateUserDTO: CreateUserDTO = {
    email: "test@example.com",
    password: "Test@123456",
    repeatPassword: "Test@123456",
    name: "Test User",
    username: "testuser",
    role: UserRole.USER,
    birthDate: new Date(),
    gender: Gender.MALE,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUserRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mockTransformer = {
      transformToDto: jest.fn(),
      serialize: jest.fn(),
    };

    mockPasswordHasher = {
      hashPassword: jest.fn(),
      comparePasswords: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockJsonFn = jest.fn();
    mockStatusFn = jest.fn().mockReturnValue({ json: mockJsonFn });
    mockResponse = { status: mockStatusFn };
    mockNext = jest.fn();

    // Setup Create User Instance
    mockCreateUserInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockReturnThis(),
      outputs: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        USER_EXISTS: 'USER_EXISTS',
      },
    } as unknown as jest.Mocked<CreateUser>;

    // Setup Get All Users Instance
    mockGetAllUsersInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockReturnThis(),
      outputs: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
      },
    } as unknown as jest.Mocked<GetAllUsers>;

    // Setup Get User Instance
    mockGetUserInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockReturnThis(),
      outputs: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        NOTFOUND_ERROR: 'NOTFOUND_ERROR',
      },
    } as unknown as jest.Mocked<GetUser>;

    // Setup Delete User Instance
    mockDeleteUserInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockReturnThis(),
      outputs: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        NOTFOUND_ERROR: 'NOTFOUND_ERROR',
        VALIDATION_ERROR: 'VALIDATION_ERROR',
      },
    } as unknown as jest.Mocked<DeleteUser>;

    (CreateUser as unknown as jest.Mock).mockImplementation(() => mockCreateUserInstance);
    ((GetAllUsers as unknown) as jest.Mock).mockImplementation(() => mockGetAllUsersInstance);
    ((GetUser as unknown) as jest.Mock).mockImplementation(() => mockGetUserInstance);
    ((DeleteUser as unknown) as jest.Mock).mockImplementation(() => mockDeleteUserInstance);

    userController = new UserController(
      mockUserRepository,
      mockTransformer,
      mockPasswordHasher,
      mockLogger,
    );
  });

  describe('createUser', () => {
    beforeEach(() => {
      // Reset and properly mock CreateUser constructor
      (CreateUser as jest.MockedClass<typeof CreateUser>)
        .mockImplementation(() => mockCreateUserInstance);

      // Mock CreateUserDTO.validate
      jest.spyOn(CreateUserDTO, 'validate').mockResolvedValue(mockCreateUserDTO);

      userController = new UserController(
        mockUserRepository,
        mockTransformer,
        mockPasswordHasher,
        mockLogger
      );
    });

    it('should successfully create a user', async () => {
      // Setup request
      mockRequest = {
        body: mockCreateUserDTO
      };

      // Mock execute to simulate successful creation
      mockCreateUserInstance.execute.mockImplementation(() => {
        // Manually trigger the success callback that was registered with onTyped
        const successCallback = mockCreateUserInstance.onTyped.mock.calls
          .find(call => call[0] === 'SUCCESS')?.[1];

        if (successCallback) {
          successCallback(mockUser);
        }
        return Promise.resolve();
      });

      // Get and execute controller method
      const { _createUser } = userController.createUser();
      await _createUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Verify onTyped was called with SUCCESS
      expect(mockCreateUserInstance.onTyped).toHaveBeenCalledWith(
        'SUCCESS',
        expect.any(Function)
      );

      // Additional verifications
      expect(mockCreateUserInstance.execute).toHaveBeenCalled();
      expect(mockTransformer.serialize).toHaveBeenCalledWith(mockUser);
      expect(mockStatusFn).toHaveBeenCalledWith(201);
    });

    it('should return 400 when validation fails', async () => {
      mockRequest = {
        body: {
          email: "test@example.com"
        }
      };

      userController = new UserController(
        mockUserRepository,
        mockTransformer,
        mockPasswordHasher,
        mockLogger
      );

      (CreateUser as jest.MockedClass<typeof CreateUser>)
        .mockImplementation(() => mockCreateUserInstance);

      const validationErrors = [{
        property: 'password',
        constraints: {
          isRequired: 'password is required'
        },
        children: []
      }];

      const validationError = new DTOValidationError(validationErrors);
      jest.spyOn(CreateUserDTO, 'validate').mockRejectedValue(validationError);

      const { _createUser } = userController.createUser();
      await _createUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Update assertion to match the actual response format
      expect(mockJsonFn).toHaveBeenCalledWith({
        type: 'ValidationError',
        details: {
          password: ['password is required']
        },
        message: 'Validation failed'
      });

      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
    });

    it('should handle user exists error', async () => {
      mockRequest = {
        body: mockCreateUserDTO,
      };

      mockTransformer.transformToDto.mockResolvedValue(mockCreateUserDTO);

      const { _createUser } = userController.createUser();
      await _createUser(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      const userExistsCallback = mockCreateUserInstance.onTyped.mock.calls.find(
        call => call[0] === 'USER_EXISTS'
      )?.[1] ?? (() => {});
      userExistsCallback('User already exists');

      expect(mockStatusFn).toHaveBeenCalledWith(status.CONFLICT);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        type: 'ConflictError',
        message: 'User already exists',
      });
    });
  });

  describe('getAllUsers', () => {
    it('should get all users successfully with pagination', async () => {
      const mockPaginatedResponse: PaginationDTO<UserResponseDTO> = {
        body: [mockUser],
        page: 1,
        limit: 10,
        total: 1,
        last_page: 1
      };

      mockRequest = {
        query: { page: '1', limit: '10' },
      };

      mockTransformer.serialize.mockReturnValue([mockUser]);

      const { _getAllUsers } = userController.getAllUsers();
      await _getAllUsers(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      const successCallback = mockGetAllUsersInstance.onTyped.mock.calls.find(
        call => call[0] === 'SUCCESS'
      )?.[1] ?? (() => {});
      successCallback(mockPaginatedResponse);

      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: {
          body: [mockUser],
          page: 1,
          limit: 10,
          total: 1,
          last_page: 1
        }
      });
    });

    it('should handle error when getting all users fails', async () => {
      mockRequest = {
        query: {},
      };

      const error = new Error('Database error');

      const { _getAllUsers } = userController.getAllUsers();
      await _getAllUsers(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      const errorCallback = mockGetAllUsersInstance.onTyped.mock.calls.find(
        call => call[0] === 'ERROR'
      )?.[1] ?? (() => {});
      errorCallback(error);

      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith({
        message: "Database error",
        type: "InternalServerError",
        details: new Error("Database error")  // Not wrapped in an array
      });
    });
  });

  describe('getUser', () => {
    it('should get a user successfully by id', async () => {
      mockRequest = {
        params: { id: mockUser.id },
      };

      mockTransformer.serialize.mockReturnValue(mockUser);

      const { _getUser } = userController.getUser();
      await _getUser(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      const successCallback = mockGetUserInstance.onTyped.mock.calls.find(
        call => call[0] === 'SUCCESS'
      )?.[1] ?? (() => {});
      successCallback(mockUser);

      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith({ data: mockUser });
    });

    it('should handle user not found error', async () => {
      mockRequest = {
        params: { id: 'non-existent-id' },
      };

      const { _getUser } = userController.getUser();
      await _getUser(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      const notFoundCallback = mockGetUserInstance.onTyped.mock.calls.find(
        call => call[0] === 'NOTFOUND_ERROR'
      )?.[1] ?? (() => {});
      notFoundCallback('User not found');

      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith({
        message: "User not found",
        type: "NotFoundError",
        details: null
      });
    });
  });

  describe('deleteUser', () => {
    it('should delete a user successfully', async () => {
      mockRequest = {
        params: { id: mockUser.id },
      };

      const { _removeUser } = userController.removeUser();
      await _removeUser(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      const successCallback = mockDeleteUserInstance.onTyped.mock.calls.find(
        call => call[0] === 'SUCCESS'
      )?.[1] ?? (() => {});
      successCallback('User deleted successfully');

      expect(mockStatusFn).toHaveBeenCalledWith(status.NO_CONTENT);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: {
          message: "User deleted successfully"
        }
      });
    });

    it('should handle validation error when id is missing', async () => {
      mockRequest = {
        params: {},
      };

      const { _removeUser } = userController.removeUser();
      await _removeUser(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      const validationCallback = mockDeleteUserInstance.onTyped.mock.calls.find(
        call => call[0] === 'VALIDATION_ERROR'
      )?.[1] ?? (() => {});
      validationCallback('User ID is required');

      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        message: "Validation failed",
        type: "ValidationError",
        details: "User ID is required"
      });
    });

    it('should handle user not found error', async () => {
      mockRequest = {
        params: { id: 'non-existent-id' },
      };

      const { _removeUser } = userController.removeUser();
      await _removeUser(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      const notFoundCallback = mockDeleteUserInstance.onTyped.mock.calls.find(
        call => call[0] === 'NOTFOUND_ERROR'
      )?.[1] ?? (() => {});
      notFoundCallback('User not found');

      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith({
        message: "User not found",
        type: "NotFoundError",
        details: null
      });
    });
  });

  describe('updateUser', () => {
    let mockUpdateUserInstance: jest.Mocked<UpdateUser>;

    beforeEach(() => {
      // Setup Update User Instance
      mockUpdateUserInstance = {
        execute: jest.fn(),
        onTyped: jest.fn().mockReturnThis(),
        outputs: {
          SUCCESS: 'SUCCESS',
          ERROR: 'ERROR',
          VALIDATION_ERROR: 'VALIDATION_ERROR',
          USER_NOT_FOUND: 'USER_NOT_FOUND',
          EMAIL_TAKEN: 'EMAIL_TAKEN',
          USERNAME_TAKEN: 'USERNAME_TAKEN',
        },
      } as unknown as jest.Mocked<UpdateUser>;

      (UpdateUser as jest.MockedClass<typeof UpdateUser>).mockImplementation(() => mockUpdateUserInstance);

      userController = new UserController(
        mockUserRepository,
        mockTransformer,
        mockPasswordHasher,
        mockLogger,
      );
    });

    it('should update a user and return success response', async () => {
      // Arrange
      const userId = faker.string.uuid();
      const mockUpdateDto = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
      };

      const updatedUser = {
        ...mockUser,
        name: mockUpdateDto.name,
        email: mockUpdateDto.email
      };

      mockRequest = {
        params: { id: userId },
        body: mockUpdateDto,
      };

      // Mock the static validate method of UpdateUserDTO
      jest.spyOn(UpdateUserDTO, 'validate').mockResolvedValue(mockUpdateDto);
      mockTransformer.serialize.mockReturnValue(updatedUser);

      mockUpdateUserInstance.onTyped.mockImplementation((event, callback) => {
        if (event === 'SUCCESS') {
          callback(updatedUser);
        }
        return mockUpdateUserInstance;
      });

      // Act
      await userController.updateUser()._updateUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(UpdateUser).toHaveBeenCalledWith(
        mockUserRepository,
        mockLogger
      );
      expect(UpdateUserDTO.validate).toHaveBeenCalledWith(mockUpdateDto);
      expect(mockUpdateUserInstance.execute).toHaveBeenCalledWith(
        userId,
        mockUpdateDto
      );
      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: updatedUser
      });
    });

    it('should handle validation errors', async () => {
      // Arrange
      const userId = faker.string.uuid();
      const mockUpdateDto = {
        email: 'invalid-email', // Invalid email format
      };

      mockRequest = {
        params: { id: userId },
        body: mockUpdateDto,
      };

      // Mock UpdateUserDTO.validate to throw a validation error
      const validationErrors = [{
        property: 'email',
        constraints: {
          isEmail: 'Invalid email format'
        }
      }];
      const dtoValidationError = new DTOValidationError(validationErrors);
      jest.spyOn(UpdateUserDTO, 'validate').mockRejectedValue(dtoValidationError);

      // Act
      await userController.updateUser()._updateUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(UpdateUserDTO.validate).toHaveBeenCalledWith(mockUpdateDto);
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        type: 'ValidationError',
        message: 'Validation failed',
        details: {
          email: ['Invalid email format']
        }
      });
    });

    it('should handle user not found error', async () => {
      // Arrange
      const userId = faker.string.uuid();
      const mockUpdateDto = {
        name: faker.person.fullName(),
      };
      const notFoundError = `User with id ${userId} not found`;

      mockRequest = {
        params: { id: userId },
        body: mockUpdateDto,
      };

      // Mock UpdateUserDTO.validate to return the validated data
      jest.spyOn(UpdateUserDTO, 'validate').mockResolvedValue(mockUpdateDto);

      mockUpdateUserInstance.onTyped.mockImplementation((event, callback) => {
        if (event === 'USER_NOT_FOUND') {
          callback(notFoundError);
        }
        return mockUpdateUserInstance;
      });

      // Mock execute to trigger the USER_NOT_FOUND event
      mockUpdateUserInstance.execute.mockImplementation(() => {
        // This will trigger the USER_NOT_FOUND callback we set up above
        mockUpdateUserInstance.onTyped.mock.calls
          .find(([event]) => event === 'USER_NOT_FOUND')?.[1](notFoundError);
        return Promise.resolve();
      });

      // Act
      await userController.updateUser()._updateUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(UpdateUserDTO.validate).toHaveBeenCalledWith(mockUpdateDto);
      expect(mockUpdateUserInstance.execute).toHaveBeenCalledWith(
        userId,
        mockUpdateDto
      );
      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: notFoundError,
        type: 'NotFoundError'
      });
    });

    it('should handle email taken conflict', async () => {
      // Arrange
      const userId = faker.string.uuid();
      const mockUpdateDto = {
        email: faker.internet.email(),
      };
      const conflictError = `Email ${mockUpdateDto.email} is already in use`;

      mockRequest = {
        params: { id: userId },
        body: mockUpdateDto,
      };

      // Mock UpdateUserDTO.validate to return the validated data
      jest.spyOn(UpdateUserDTO, 'validate').mockResolvedValue(mockUpdateDto);

      mockUpdateUserInstance.onTyped.mockImplementation((event, callback) => {
        if (event === 'EMAIL_TAKEN') {
          callback(conflictError);
        }
        return mockUpdateUserInstance;
      });

      // Mock execute to trigger the EMAIL_TAKEN event
      mockUpdateUserInstance.execute.mockImplementation(async (id, data) => {
        expect(id).toBe(userId);
        expect(data).toEqual(mockUpdateDto);

        // Trigger the EMAIL_TAKEN callback
        mockUpdateUserInstance.onTyped.mock.calls
          .find(([event]) => event === 'EMAIL_TAKEN')?.[1](conflictError);
      });

      // Act
      await userController.updateUser()._updateUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(UpdateUserDTO.validate).toHaveBeenCalledWith(mockUpdateDto);
      expect(mockUpdateUserInstance.execute).toHaveBeenCalledWith(
        userId,
        mockUpdateDto
      );
      expect(mockStatusFn).toHaveBeenCalledWith(status.CONFLICT);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: conflictError,
        type: 'ConflictError'
      });
    });

    it('should handle username taken conflict', async () => {
      // Arrange
      const userId = faker.string.uuid();
      const mockUpdateDto = {
        username: faker.internet.username(),
      };
      const conflictError = `Username ${mockUpdateDto.username} is already taken`;

      mockRequest = {
        params: { id: userId },
        body: mockUpdateDto,
      };

      // Mock UpdateUserDTO.validate to return the validated data
      jest.spyOn(UpdateUserDTO, 'validate').mockResolvedValue(mockUpdateDto);

      mockUpdateUserInstance.onTyped.mockImplementation((event, callback) => {
        if (event === 'USERNAME_TAKEN') {
          callback(conflictError);
        }
        return mockUpdateUserInstance;
      });

      // Mock execute to trigger the USERNAME_TAKEN event
      mockUpdateUserInstance.execute.mockImplementation(async (id, data) => {
        expect(id).toBe(userId);
        expect(data).toEqual(mockUpdateDto);

        // Trigger the USERNAME_TAKEN callback
        mockUpdateUserInstance.onTyped.mock.calls
          .find(([event]) => event === 'USERNAME_TAKEN')?.[1](conflictError);
        return Promise.resolve();
      });

      // Act
      await userController.updateUser()._updateUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(UpdateUserDTO.validate).toHaveBeenCalledWith(mockUpdateDto);
      expect(mockUpdateUserInstance.execute).toHaveBeenCalledWith(
        userId,
        mockUpdateDto
      );
      expect(mockStatusFn).toHaveBeenCalledWith(status.CONFLICT);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: conflictError,
        type: 'ConflictError'
      });
    });

    it('should handle unexpected errors', async () => {
      // Arrange
      const userId = faker.string.uuid();
      const mockUpdateDto = {
        username: faker.internet.username(),
      };
      const unexpectedError = new Error('Unexpected error');

      mockRequest = {
        params: { id: userId },
        body: mockUpdateDto,
      };

      // Mock UpdateUserDTO.validate to return the validated data
      jest.spyOn(UpdateUserDTO, 'validate').mockResolvedValue(mockUpdateDto);

      mockUpdateUserInstance.onTyped.mockImplementation((event, callback) => {
        if (event === 'ERROR') {
          callback(unexpectedError);
        }
        return mockUpdateUserInstance;
      });

      // Mock execute to trigger the ERROR event
      mockUpdateUserInstance.execute.mockImplementation(async (id, data) => {
        // Trigger the ERROR callback
        mockUpdateUserInstance.onTyped.mock.calls
          .find(([event]) => event === 'ERROR')?.[1](unexpectedError);
        return Promise.resolve();
      });

      // Act
      await userController.updateUser()._updateUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(UpdateUserDTO.validate).toHaveBeenCalledWith(mockUpdateDto);
      expect(mockUpdateUserInstance.execute).toHaveBeenCalledWith(
        userId,
        mockUpdateDto
      );
      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: unexpectedError,
        message: 'Unexpected error',
        type: 'InternalServerError'
      });
    });

    it('should handle missing user ID', async () => {
      // Arrange
      mockRequest = {
        params: {},
        body: { name: faker.person.fullName() },
      };

      // Act
      await userController.updateUser()._updateUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'User ID is required',
        message: 'Validation failed',
        type: 'ValidationError'
      });
      expect(mockUpdateUserInstance.execute).not.toHaveBeenCalled();
    });

    it('should handle transforming errors', async () => {
      // Arrange
      const userId = faker.string.uuid();
      const mockRequest = {
        params: { id: userId },
        body: { name: '@invalid-name!' }, // Invalid name with special characters
      };

      // Create proper validation error structure
      const validationErrors = [{
        property: 'name',
        constraints: {
          matches: 'Name must contain only alphanumeric characters and spaces'
        }
      }];
      const dtoValidationError = new DTOValidationError(validationErrors);

      // Mock UpdateUserDTO.validate to throw the validation error
      jest.spyOn(UpdateUserDTO, 'validate').mockRejectedValue(dtoValidationError);

      // Act
      await userController.updateUser()._updateUser(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        type: 'ValidationError',
        message: 'Validation failed',
        details: {
          name: ['Name must contain only alphanumeric characters and spaces']
        }
      });
      expect(mockUpdateUserInstance.execute).not.toHaveBeenCalled();
    });
  });
});
