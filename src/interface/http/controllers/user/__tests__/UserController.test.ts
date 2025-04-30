import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';
import status from 'http-status';

// --- Application Layer Mocks ---
import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { ITransformer } from 'src/application/contracts/transformer';
import {
  CreateUser,
  DeleteUser,
  GetAllUsers,
  GetUser,
  UpdateUser
} from '@application/use_cases/user';

// --- Enterprise Layer Mocks ---
import {
  CreateUserDTO,
  UpdateUserDTO,
  GetAllUsersInputDTO,
  GetUserInputDTO
} from '@enterprise/dto/input/user';
import { PaginationDTO, UserResponseDTO } from '@enterprise/dto/output';
import { DTOValidationError } from '@enterprise/dto/errors';
import { UserRole } from '@enterprise/enum';

// --- Interface Layer ---
import {
  HttpRequest,
  HttpResponse,
  HttpNext,
  ResponseObject, ControllerMethod
} from '@interface/http/adapters/Http';
import { UserController } from '@interface/http/controllers/user/UserController';
import { ValidationError } from 'class-validator';

// --- Mock Use Cases ---
// We need to mock the entire use case module
// Store listeners and allow triggering them from mock executing
type EventListener = (...args: any[]) => void;
type Listeners = { [key: string]: EventListener };

const mockUseCase = (events: string[]) => {
  const listeners: Listeners = {};
  return {
    on: jest.fn((event: string, listener: EventListener) => {
      if (events.includes(event)) {
        listeners[event] = listener;
      }
    }),
    execute: jest.fn(async (..._args: any[]) => {
      // This mock executing needs to be configured per test
      // to call the appropriate listener (e.g., listeners['SUCCESS'](mockData))
    }),
    // Helper to trigger events from tests
    __trigger: (event: string, ...args: any[]) => {
      if (listeners[event]) {
        listeners[event](...args);
      } else {
        // Optional: throw an error if trying to trigger an unlistened event
        // console.warn(`Mock UseCase: Event "${event}" has no listener.`);
      }
    }
  };
};

// Mock the actual use case classes
jest.mock('@application/use_cases/user', () => ({
  CreateUser: jest.fn().mockImplementation(() => mockUseCase(['SUCCESS', 'VALIDATION_ERROR', 'USER_EXISTS', 'ERROR'])),
  GetAllUsers: jest.fn().mockImplementation(() => mockUseCase(['SUCCESS', 'ERROR'])),
  GetUser: jest.fn().mockImplementation(() => mockUseCase(['SUCCESS', 'NOTFOUND_ERROR', 'ERROR'])),
  DeleteUser: jest.fn().mockImplementation(() => mockUseCase(['SUCCESS', 'NOTFOUND_ERROR', 'ERROR'])),
  UpdateUser: jest.fn().mockImplementation(() => mockUseCase(['SUCCESS', 'USER_NOT_FOUND', 'EMAIL_TAKEN', 'USERNAME_TAKEN', 'ERROR'])),
}));

// Mock DTO static validate methods
jest.mock('@enterprise/dto/input/user', () => ({
  CreateUserDTO: {
    validate: jest.fn<
      (data: Record<string, unknown>) => Promise<CreateUserDTO> // Specify the type here
    >()
  },
  UpdateUserDTO: {
    validate: jest.fn<
      (data: Record<string, unknown>) => Promise<UpdateUserDTO> // Specify the type here
    >()
  },
  GetAllUsersInputDTO: {
    validate: jest.fn<
      (data: Record<string, unknown>) => Promise<GetAllUsersInputDTO> // Specify the type here
    >()
  },
  GetUserInputDTO: {
    validate: jest.fn<
      (data: Record<string, unknown>) => Promise<GetUserInputDTO> // Specify the type here
    >()
  },
}));

jest.mock('@interface/http/decorators/Authorize', () => {
  const Authorize = () => function(_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    return descriptor;
  };

  /* @__PURE__ */ void Authorize;

  return { Authorize };
});

// --- Mock Dependencies ---
const mockUserRepository: jest.Mocked<IUserRepository> = {
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockTransformer: jest.Mocked<ITransformer> = {
  transformToDto: jest.fn(async (data, _dtoClass) => {
    return Promise.resolve(data as any);
  }),
  serialize: jest.fn(data => data as any),
  deserialize: jest.fn(async (data, _targetClass) => {
    return Promise.resolve(data as any);
  }),
};

const mockPasswordHasher: jest.Mocked<IPasswordHasher> = {
  hashPassword: jest.fn(),
  comparePasswords: jest.fn(),
};

const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// --- Mock HTTP Objects (similar to BaseController.test.ts) ---
const mockJson = jest.fn();
const mockResponseObject: jest.Mocked<ResponseObject> = {
  json: mockJson,
  // Add other methods like send, end if needed by BaseController methods
};
const mockStatus = jest.fn<(code: number) => ResponseObject>().mockReturnValue(mockResponseObject);

// Define the main mockResponse, satisfying HttpResponse
const mockResponse: jest.Mocked<HttpResponse> = {
  status: mockStatus,
};

const mockRequest: jest.Mocked<HttpRequest> = {
  body: {},
  params: {},
  query: {},
  headers: {},
};

const mockNext: jest.Mocked<HttpNext> = jest.fn();

// Helper to create DTOValidationError
const createDtoValidationError = (errors: { property: string; constraints: { [type: string]: string } }[]): DTOValidationError => {
  const validationErrors: ValidationError[] = errors.map(e => ({
    property: e.property,
    constraints: e.constraints,
    value: 'mockValue', // Add fake values for other properties if needed
    target: {},
    children: [],
  }));
  return new DTOValidationError(validationErrors);
};

// --- Test Suite ---
describe('UserController', () => {
  let userController: UserController;
  let mockCreateUserUseCase: ReturnType<typeof mockUseCase>;
  let mockGetAllUsersUseCase: ReturnType<typeof mockUseCase>;
  let mockGetUserUseCase: ReturnType<typeof mockUseCase>;
  let mockDeleteUserUseCase: ReturnType<typeof mockUseCase>;
  let mockUpdateUserUseCase: ReturnType<typeof mockUseCase>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Instantiate the controller with mocks
    userController = new UserController(
      mockUserRepository,
      mockTransformer,
      mockPasswordHasher,
      mockLogger
    );

    // Get mock instances of use cases
    // Type assertion is needed because TS doesn't know the mock implementation details
    mockCreateUserUseCase = new CreateUser(mockUserRepository, mockPasswordHasher, mockLogger) as any;
    mockGetAllUsersUseCase = new GetAllUsers(mockUserRepository, mockLogger) as any;
    mockGetUserUseCase = new GetUser(mockUserRepository, mockLogger) as any;
    mockDeleteUserUseCase = new DeleteUser(mockUserRepository, mockLogger) as any;
    mockUpdateUserUseCase = new UpdateUser(mockUserRepository, mockLogger) as any;

    (CreateUser as any).mockImplementation(() => mockCreateUserUseCase);
    (GetAllUsers as any).mockImplementation(() => mockGetAllUsersUseCase);
    (GetUser as any).mockImplementation(() => mockGetUserUseCase);
    (DeleteUser as any).mockImplementation(() => mockDeleteUserUseCase);
    (UpdateUser as any).mockImplementation(() => mockUpdateUserUseCase);

    // Reset request object parts
    mockRequest.body = {};
    mockRequest.params = {};
    mockRequest.query = {};
  });

  // --- Test Cases ---

  describe('createUser', () => {
    let _createUser: ControllerMethod;
    let createUserDto: CreateUserDTO;
    let createdUser: UserResponseDTO;

    beforeEach(() => {
      _createUser = userController.createUser()._createUser;

      createUserDto = {
        repeatPassword: faker.internet.password({ length: 10, prefix: '!A1a'}),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: faker.internet.username(),
        password: faker.internet.password({ length: 10, prefix: '!A1a'}),
        role: UserRole.USER
      };
      createdUser = {
        id: faker.string.uuid(),
        ...createUserDto,
        birthDate: undefined,
        gender: undefined,
        isVerified: false,
      };
      mockRequest.body = createUserDto;
      // Mock DTO validation success by default
      // Define a type for the function first
      type ValidateFunction = (data: Record<string, unknown>) => Promise<CreateUserDTO>;
      (CreateUserDTO.validate as jest.MockedFunction<ValidateFunction>).mockResolvedValue(createUserDto);
      // Mock Use Case execution to trigger SUCCESS by default
      (mockCreateUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockCreateUserUseCase.__trigger('SUCCESS', createdUser);
      });
      // Mock transformer serialization
      (mockTransformer.serialize as jest.Mock).mockImplementation(data => data);
    });

    it('should create a user successfully and return 201 status', async () => {
      await _createUser(mockRequest, mockResponse, mockNext);

      expect(CreateUserDTO.validate).toHaveBeenCalledWith(createUserDto);
      expect(CreateUser).toHaveBeenCalledWith(mockUserRepository, mockPasswordHasher, mockLogger);
      expect(mockCreateUserUseCase.execute).toHaveBeenCalledWith(createUserDto);
      expect(mockTransformer.serialize).toHaveBeenCalledWith(createdUser);
      expect(mockStatus).toHaveBeenCalledWith(status.CREATED);
      expect(mockJson).toHaveBeenCalledWith({ data: createdUser }); // BaseController wraps in { data: ... }
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle validation errors and return 400 status', async () => {
      const validationError = createDtoValidationError([{ property: 'email', constraints: { isEmail: 'Invalid email format' } }]);
      const expectedFormattedErrors = { email: ['Invalid email format'] };
      // Define a type for the validation function that correctly includes rejected values
      type ValidateFunction = (data: Record<string, unknown>) => Promise<CreateUserDTO>;
      type MockValidateFunction = jest.MockedFunction<ValidateFunction> & {
        mockRejectedValue(value: Error | DTOValidationError): jest.MockedFunction<ValidateFunction>;
      };

      (CreateUserDTO.validate as MockValidateFunction).mockRejectedValue(validationError);

      await _createUser(mockRequest, mockResponse, mockNext);

      expect(CreateUserDTO.validate).toHaveBeenCalledWith(createUserDto);
      expect(mockCreateUserUseCase.execute).not.toHaveBeenCalled(); // Should fail before executing
      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ValidationError',
        message: 'Validation failed',
        details: expectedFormattedErrors
      }));
      expect(mockLogger.error).not.toHaveBeenCalled(); // Validation errors are not logged as errors
    });

    it('should handle user exists conflict and return 409 status', async () => {
      const conflictError = 'User with this email already exists.';
      (mockCreateUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockCreateUserUseCase.__trigger('USER_EXISTS', conflictError);
      });

      await _createUser(mockRequest, mockResponse, mockNext);

      expect(CreateUserDTO.validate).toHaveBeenCalledWith(createUserDto);
      expect(mockCreateUserUseCase.execute).toHaveBeenCalledWith(createUserDto);
      expect(mockStatus).toHaveBeenCalledWith(status.CONFLICT);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ConflictError',
        message: conflictError,
        details: null
      }));
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle generic errors during use case execution and return 500 status', async () => {
      const genericError = new Error('Database connection failed');
      // Instead of triggering the event, throw the error directly
      (mockCreateUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        throw genericError;
      });

      await _createUser(mockRequest, mockResponse, mockNext);

      expect(CreateUserDTO.validate).toHaveBeenCalledWith(createUserDto);
      expect(mockCreateUserUseCase.execute).toHaveBeenCalledWith(createUserDto);
      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'InternalServerError',
        message: genericError.message,
      }));
      expect(mockLogger.error).toHaveBeenCalled(); // executeSafely logs generic errors
    });

    it('should handle generic errors during DTO validation and return 500 status', async () => {
      const genericError = new Error('Unexpected validation issue');

      // Use mockImplementation instead of mockRejectedValue
      (CreateUserDTO.validate as jest.Mock).mockImplementation(() => {
        return Promise.reject(genericError);
      });

      await _createUser(mockRequest, mockResponse, mockNext);

      expect(CreateUserDTO.validate).toHaveBeenCalledWith(createUserDto);
      expect(mockCreateUserUseCase.execute).not.toHaveBeenCalled(); // Fails before execution
      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'InternalServerError',
        message: genericError.message,
      }));
      expect(mockLogger.error).toHaveBeenCalled(); // executeSafely logs generic errors
    });
  });

  describe('getAllUsers', () => {
    let _getAllUsers: ControllerMethod;
    let paginationInput: GetAllUsersInputDTO;
    let paginatedUsers: PaginationDTO<UserResponseDTO>;
    let mockUsers: UserResponseDTO[];

    beforeEach(() => {
      _getAllUsers = userController.getAllUsers()._getAllUsers;

      mockUsers = Array.from({ length: 3 }, () => ({
        id: faker.string.uuid(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: faker.internet.username(),
        role: UserRole.USER,
        isVerified: faker.datatype.boolean(),
        createdAt: faker.date.past(),
        updatedAt: faker.date.recent(),
        birthDate: undefined,
        gender: undefined,
      }));

      paginationInput = { page: 1, limit: 10 }; // Default or example input

      paginatedUsers = {
        body: mockUsers,
        page: paginationInput.page!,
        limit: paginationInput.limit!,
        total: mockUsers.length,
        last_page: Math.ceil(mockUsers.length / paginationInput.limit!)
      };

      // Use a more direct approach without type assertions
      jest.spyOn(GetAllUsersInputDTO, 'validate').mockImplementation(() => Promise.resolve(paginationInput));
      // Mock Use Case execution to trigger SUCCESS by default
      (mockGetAllUsersUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockGetAllUsersUseCase.__trigger('SUCCESS', paginatedUsers);
      });
      // Mock transformer serialization
      (mockTransformer.serialize as jest.Mock).mockImplementation(data => data);
    });

    it('should get all users successfully with default pagination and return 200 status', async () => {
      // Simulate request without query params
      mockRequest.query = {};
      const expectedValidationInput = { page: 1, limit: 10 }; // Default values in controller method
      (GetAllUsersInputDTO.validate as any).mockResolvedValue(expectedValidationInput);
      paginatedUsers.page = expectedValidationInput.page; // Ensure mock data matches validation output
      paginatedUsers.limit = expectedValidationInput.limit;

      await _getAllUsers(mockRequest, mockResponse, mockNext);

      expect(GetAllUsersInputDTO.validate).toHaveBeenCalledWith(expectedValidationInput);
      expect(GetAllUsers).toHaveBeenCalledWith(mockUserRepository, mockLogger);
      expect(mockGetAllUsersUseCase.execute).toHaveBeenCalledWith(expectedValidationInput);
      expect(mockTransformer.serialize).toHaveBeenCalledWith(paginatedUsers.body);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({
        data: { // Change this line - data contains the whole paginated object
          body: paginatedUsers.body,
          page: paginatedUsers.page,
          limit: paginatedUsers.limit,
          total: paginatedUsers.total,
          last_page: Math.ceil(paginatedUsers.total / paginatedUsers.limit!)
        }
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should get all users successfully with custom pagination and return 200 status', async () => {
      // Simulate request with query params
      const customPagination = { page: 2, limit: 5 };
      mockRequest.query = { page: String(customPagination.page), limit: String(customPagination.limit) };
      (GetAllUsersInputDTO.validate as any).mockResolvedValue(customPagination);
      paginatedUsers.page = customPagination.page; // Ensure mock data matches validation output
      paginatedUsers.limit = customPagination.limit;
      paginatedUsers.total = 15; // Example total

      await _getAllUsers(mockRequest, mockResponse, mockNext);

      expect(GetAllUsersInputDTO.validate).toHaveBeenCalledWith(customPagination);
      expect(mockGetAllUsersUseCase.execute).toHaveBeenCalledWith(customPagination);
      expect(mockTransformer.serialize).toHaveBeenCalledWith(paginatedUsers.body);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({
        data: {
          body: paginatedUsers.body,
          page: customPagination.page,
          limit: customPagination.limit,
          total: paginatedUsers.total,
          last_page: Math.ceil(paginatedUsers.total / customPagination.limit),
        }
      });
    });

    it('should handle validation errors for pagination and return 400 status', async () => {
      mockRequest.query = { page: 'invalid', limit: '-5' };
      const validationError = createDtoValidationError([
        { property: 'page', constraints: { isInt: 'Page must be an integer' } },
        { property: 'limit', constraints: { min: 'Limit must not be less than 1' } }
      ]);
      const expectedFormattedErrors = { page: ['Page must be an integer'], limit: ['Limit must not be less than 1'] };
      (GetAllUsersInputDTO.validate as any).mockRejectedValue(validationError);

      await _getAllUsers(mockRequest, mockResponse, mockNext);

      expect(GetAllUsersInputDTO.validate).toHaveBeenCalledWith({ page: NaN, limit: 1 });
      expect(mockGetAllUsersUseCase.execute).not.toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ValidationError',
        message: 'Validation failed',
        details: expectedFormattedErrors
      }));
    });

    it('should handle generic errors during validation and return 500 status', async () => {
      const genericError = new Error('Unexpected validation issue');

      // Use mockImplementation instead of mockRejectedValue
      (GetAllUsersInputDTO.validate as jest.Mock).mockImplementation(() => {
        return Promise.reject(genericError);
      });

      await _getAllUsers(mockRequest, mockResponse, mockNext);

      expect(GetAllUsersInputDTO.validate).toHaveBeenCalled();
      // The execute function should NOT be called if validation fails with a generic error
      expect(mockGetAllUsersUseCase.execute).not.toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ type: 'InternalServerError' }));
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    let _getUser: ControllerMethod;
    let userInput: GetUserInputDTO;
    let foundUser: UserResponseDTO;
    let userId: string;

    beforeEach(() => {
      _getUser = userController.getUser()._getUser;

      userId = faker.string.uuid();
      userInput = { id: userId };
      foundUser = {
        id: userId,
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: faker.internet.username(),
        role: UserRole.ADMIN,
        isVerified: true,
        birthDate: undefined,
        gender: undefined,
      };
      mockRequest.params = { id: userId };

      // Mocks
      (GetUserInputDTO.validate as any).mockResolvedValue(userInput);
      (mockGetUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockGetUserUseCase.__trigger('SUCCESS', foundUser);
      });
      (mockTransformer.serialize as jest.Mock).mockImplementation(data => data);
    });

    it('should get a user successfully by ID and return 200 status', async () => {
      await _getUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: userId });
      expect(GetUser).toHaveBeenCalledWith(mockUserRepository, mockLogger);
      expect(mockGetUserUseCase.execute).toHaveBeenCalledWith(userInput);
      expect(mockTransformer.serialize).toHaveBeenCalledWith(foundUser);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({ data: foundUser });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle user not found and return 404 status', async () => {
      const notFoundError = `User with id ${userId} not found.`;
      (mockGetUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockGetUserUseCase.__trigger('NOTFOUND_ERROR', notFoundError);
      });

      await _getUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: userId });
      expect(mockGetUserUseCase.execute).toHaveBeenCalledWith(userInput);
      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'NotFoundError',
        message: notFoundError,
        details: null
      }));
    });

    it('should handle validation errors for user input and return 400 status', async () => {
      mockRequest.params = { id: 'invalid-uuid' }; // Example invalid ID
      const validationError = createDtoValidationError([{ property: 'id', constraints: { isUuid: 'ID must be a UUID' } }]);
      const expectedFormattedErrors = { id: ['ID must be a UUID'] };
      (GetUserInputDTO.validate as any).mockRejectedValue(validationError);


      await _getUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: 'invalid-uuid' });
      expect(mockGetUserUseCase.execute).not.toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ValidationError',
        details: expectedFormattedErrors,
        message: 'Validation failed'
      }));
    });

    it('should handle generic errors during use case execution and return 500 status', async () => {
      const genericError = new Error('Database query failed');

      // Make sure validation passes
      (GetUserInputDTO.validate as any).mockResolvedValue(userInput);

      (mockGetUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        throw genericError;
      });

      await _getUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalled();
      expect(mockGetUserUseCase.execute).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ type: 'InternalServerError' }));
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('removeUser', () => {
    let _removeUser: ControllerMethod;
    let userInput: GetUserInputDTO;
    let userId: string;

    beforeEach(() => {
      _removeUser = userController.removeUser()._removeUser;

      userId = faker.string.uuid();
      userInput = { id: userId };
      mockRequest.params = { id: userId };

      // Mocks
      (GetUserInputDTO.validate as any).mockResolvedValue(userInput);
      (mockDeleteUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockDeleteUserUseCase.__trigger('SUCCESS', 'User successfully deleted'); // Success payload is a message
      });
    });

    it('should remove a user successfully and return 204 status', async () => {
      await _removeUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: userId });
      expect(DeleteUser).toHaveBeenCalledWith(mockUserRepository, mockLogger);
      expect(mockDeleteUserUseCase.execute).toHaveBeenCalledWith(userInput);
      expect(mockStatus).toHaveBeenCalledWith(status.NO_CONTENT);
      // status().json() might still be called by handleSuccess even for 204 depending on BaseController logic
      // If handleSuccess specifically avoids .json for 204, adjust this expectation.
      // Assuming BaseController calls .json({ data: message }) for consistency:
      expect(mockJson).toHaveBeenCalledWith({ data: 'User successfully deleted' });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle user not found and return 404 status', async () => {
      const notFoundError = `User with id ${userId} not found.`;
      (mockDeleteUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockDeleteUserUseCase.__trigger('NOTFOUND_ERROR', notFoundError);
      });

      await _removeUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: userId });
      expect(mockDeleteUserUseCase.execute).toHaveBeenCalledWith(userInput);
      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'NotFoundError',
        message: notFoundError,
        details: null
      }));
    });

    it('should handle validation errors for user input and return 400 status', async () => {
      mockRequest.params = { id: 'invalid-uuid' }; // Example invalid ID
      const validationError = createDtoValidationError([{ property: 'id', constraints: { isUuid: 'ID must be a UUID' } }]);
      const expectedFormattedErrors = { id: ['ID must be a UUID'] };
      (GetUserInputDTO.validate as any).mockRejectedValue(validationError);

      await _removeUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: 'invalid-uuid' });
      expect(mockDeleteUserUseCase.execute).not.toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ValidationError',
        details: expectedFormattedErrors,
        message: 'Validation failed'
      }));
    });

    it('should handle generic errors during use case execution and return 500 status', async () => {
      const genericError = new Error('Database delete operation failed');

      // Make sure validation passes
      (GetUserInputDTO.validate as any).mockResolvedValue(userInput);

      // Use mockRejectedValue to directly throw an error during execution
      (mockDeleteUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        throw genericError;
      });

      await _removeUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalled();
      expect(mockDeleteUserUseCase.execute).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ type: 'InternalServerError' }));
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    let _updateUser: ControllerMethod;
    let userIdInput: GetUserInputDTO;
    let updateDataDto: UpdateUserDTO;
    let updatedUser: UserResponseDTO;
    let userId: string;

    beforeEach(() => {
      _updateUser = userController.updateUser()._updateUser;

      userId = faker.string.uuid();
      userIdInput = { id: userId };
      updateDataDto = {
        name: faker.person.fullName(),
        isVerified: faker.datatype.boolean(),
      };
      updatedUser = {
        id: userId,
        name: updateDataDto.name!,
        email: faker.internet.email(), // Assuming email didn't change or fetched from repo mock
        username: faker.internet.username(), // Same assumption
        role: UserRole.USER,
        isVerified: updateDataDto.isVerified!,
        birthDate: undefined,
        gender: undefined,
      };

      mockRequest.params = { id: userId };
      mockRequest.body = updateDataDto;

      // Mocks
      (GetUserInputDTO.validate as any).mockResolvedValue(userIdInput);
      (UpdateUserDTO.validate as any).mockResolvedValue(updateDataDto);
      (mockUpdateUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockUpdateUserUseCase.__trigger('SUCCESS', updatedUser);
      });
      (mockTransformer.serialize as jest.Mock).mockImplementation(data => data);
    });

    it('should update a user successfully and return 200 status', async () => {
      await _updateUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: userId });
      expect(UpdateUserDTO.validate).toHaveBeenCalledWith(updateDataDto);
      expect(UpdateUser).toHaveBeenCalledWith(mockUserRepository, mockLogger);
      // Note: UpdateUser use case takes TWO arguments in its execute method
      expect(mockUpdateUserUseCase.execute).toHaveBeenCalledWith(userIdInput, updateDataDto);
      expect(mockTransformer.serialize).toHaveBeenCalledWith(updatedUser);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({ data: updatedUser });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle user not found and return 404 status', async () => {
      const notFoundError = `User with id ${userId} not found.`;
      (mockUpdateUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockUpdateUserUseCase.__trigger('USER_NOT_FOUND', notFoundError);
      });

      await _updateUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: userId });
      expect(UpdateUserDTO.validate).toHaveBeenCalledWith(updateDataDto);
      expect(mockUpdateUserUseCase.execute).toHaveBeenCalledWith(userIdInput, updateDataDto);
      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'NotFoundError',
        message: notFoundError,
        details: null
      }));
    });

    it('should handle email taken conflict and return 409 status', async () => {
      const conflictError = 'Email is already in use.';
      (mockUpdateUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockUpdateUserUseCase.__trigger('EMAIL_TAKEN', conflictError);
      });

      await _updateUser(mockRequest, mockResponse, mockNext);

      expect(mockUpdateUserUseCase.execute).toHaveBeenCalledWith(userIdInput, updateDataDto);
      expect(mockStatus).toHaveBeenCalledWith(status.CONFLICT);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ConflictError',
        message: conflictError,
        details: null
      }));
    });

    it('should handle username taken conflict and return 409 status', async () => {
      const conflictError = 'Username is already taken.';
      (mockUpdateUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockUpdateUserUseCase.__trigger('USERNAME_TAKEN', conflictError);
      });

      await _updateUser(mockRequest, mockResponse, mockNext);

      expect(mockUpdateUserUseCase.execute).toHaveBeenCalledWith(userIdInput, updateDataDto);
      expect(mockStatus).toHaveBeenCalledWith(status.CONFLICT);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ConflictError',
        message: conflictError,
        details: null
      }));
    });

    it('should handle validation errors for user ID and return 400 status', async () => {
      mockRequest.params = { id: 'invalid-uuid' };
      const validationError = createDtoValidationError([{ property: 'id', constraints: { isUuid: 'ID must be a UUID' } }]);
      const expectedFormattedErrors = { id: ['ID must be a UUID'] };
      (GetUserInputDTO.validate as any).mockRejectedValue(validationError);

      await _updateUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: 'invalid-uuid' });
      expect(UpdateUserDTO.validate).not.toHaveBeenCalled(); // Fails before body validation
      expect(mockUpdateUserUseCase.execute).not.toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ValidationError',
        details: expectedFormattedErrors,
        message: 'Validation failed'
      }));
    });

    it('should handle validation errors for update data and return 400 status', async () => {
      mockRequest.body = { email: 'not-an-email' };
      const validationError = createDtoValidationError([{ property: 'email', constraints: { isEmail: 'Invalid email format' } }]);
      const expectedFormattedErrors = { email: ['Invalid email format'] };
      // Ensure GetUserInputDTO validates successfully first
      (GetUserInputDTO.validate as any).mockResolvedValue(userIdInput);
      // Then make UpdateUserDTO validation fail
      (UpdateUserDTO.validate as any).mockRejectedValue(validationError);

      await _updateUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalledWith({ id: userId });
      expect(UpdateUserDTO.validate).toHaveBeenCalledWith({ email: 'not-an-email' });
      expect(mockUpdateUserUseCase.execute).not.toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ValidationError',
        details: expectedFormattedErrors,
        message: 'Validation failed'
      }));
    });

    it('should handle generic errors during use case execution and return 500 status', async () => {
      const genericError = new Error('Database update failed');

      // Make sure validation passes
      (GetUserInputDTO.validate as any).mockResolvedValue(userIdInput);
      (UpdateUserDTO.validate as any).mockResolvedValue(updateDataDto);

      // Direct error throw approach - cleaner than using __trigger
      (mockUpdateUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        throw genericError;
      });

      await _updateUser(mockRequest, mockResponse, mockNext);

      expect(GetUserInputDTO.validate).toHaveBeenCalled();
      expect(UpdateUserDTO.validate).toHaveBeenCalled();
      expect(mockUpdateUserUseCase.execute).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ type: 'InternalServerError' }));
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
