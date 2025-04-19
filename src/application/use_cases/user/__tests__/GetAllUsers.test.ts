import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';
import { GetAllUsers } from '@application/use_cases/user';
import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { GetAllUsersInputDTO } from '@enterprise/dto/input/user';
import { UserResponseDTO, PaginationDTO } from '@enterprise/dto/output';
import { OperationError } from '@application/use_cases/base';
import { UserRole } from '@enterprise/enum';

const mockUserRepository: jest.Mocked<IUserRepository> = {
  findAll: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('GetAllUsers Use Case', () => {
  let getAllUsers: GetAllUsers;

  beforeEach(() => {
    jest.clearAllMocks();
    getAllUsers = new GetAllUsers(mockUserRepository, mockLogger);
  });

  const createFakeUserResponse = (): UserResponseDTO => ({
    id: faker.string.uuid(),
    username: faker.internet.username(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    role: faker.helpers.arrayElement(Object.values(UserRole)),
    isVerified: faker.datatype.boolean(),
  });

  const createFakePaginationResponse = (
    page: number,
    limit: number,
    totalItems?: number
  ): PaginationDTO<UserResponseDTO> => {
    const items = Array.from({ length: Math.min(limit, totalItems ?? limit) }, createFakeUserResponse);
    const total = totalItems ?? items.length + (page > 1 ? limit : 0);
    const lastPage = Math.ceil(total / limit);
    return {
      body: items,
      total: total,
      page: page,
      limit: limit,
      last_page: lastPage,
    };
  };

  describe('execute', () => {
    it('should call UserRepository.findAll with correct page and limit', async () => {
      // Arrange
      const input: GetAllUsersInputDTO = { page: 1, limit: 10 };
      const fakeResponse = createFakePaginationResponse(input.page, input.limit);
      mockUserRepository.findAll.mockResolvedValueOnce(fakeResponse);

      // Act
      await getAllUsers.execute(input);

      // Assert
      expect(mockUserRepository.findAll).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findAll).toHaveBeenCalledWith(input.page, input.limit);
    });

    it('should emit SUCCESS with paginated user data when repository call is successful', async () => {
      // Arrange
      const input: GetAllUsersInputDTO = { page: faker.number.int({ min: 1, max: 5 }), limit: faker.number.int({ min: 5, max: 20 }) };
      const expectedPaginationData = createFakePaginationResponse(input.page, input.limit, 50); // Simulate total > limit
      mockUserRepository.findAll.mockResolvedValueOnce(expectedPaginationData);

      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      getAllUsers.on('SUCCESS', successHandler);
      getAllUsers.on('ERROR', errorHandler);

      // Act
      await getAllUsers.execute(input);

      // Assert
      expect(successHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenCalledWith(expectedPaginationData);
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should emit SUCCESS with empty pagination data when repository finds no users', async () => {
      // Arrange
      const input: GetAllUsersInputDTO = { page: 1, limit: 10 };
      const emptyPaginationData: PaginationDTO<UserResponseDTO> = {
        body: [],
        total: 0,
        page: input.page,
        limit: input.limit,
        last_page: 1 // Or 0, depending on convention for no results
      };
      mockUserRepository.findAll.mockResolvedValueOnce(emptyPaginationData);

      const successHandler = jest.fn();
      getAllUsers.on('SUCCESS', successHandler);

      // Act
      await getAllUsers.execute(input);

      // Assert
      expect(successHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenCalledWith(emptyPaginationData);
      expect(mockUserRepository.findAll).toHaveBeenCalledWith(input.page, input.limit);
    });


    it('should emit ERROR when UserRepository.findAll rejects with an Error', async () => {
      // Arrange
      const input: GetAllUsersInputDTO = { page: 1, limit: 15 };
      const expectedError = new Error('Database connection lost');
      mockUserRepository.findAll.mockRejectedValueOnce(expectedError);

      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      getAllUsers.on('SUCCESS', successHandler);
      getAllUsers.on('ERROR', errorHandler);

      // Act
      await getAllUsers.execute(input);

      // Assert
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).not.toHaveBeenCalled();
      expect(mockUserRepository.findAll).toHaveBeenCalledWith(input.page, input.limit);

      // Check the emitted error details
      const emittedError = errorHandler.mock.calls[0][0] as OperationError;
      expect(emittedError).toBeInstanceOf(OperationError);
      expect(emittedError.code).toBe('GET_USERS_ERROR');
      expect(emittedError.message).toBe(expectedError.message);
      expect(emittedError.details).toBe(expectedError); // Check if the original error is attached
    });

    it('should emit ERROR when UserRepository.findAll rejects with a non-Error value', async () => {
      // Arrange
      const input: GetAllUsersInputDTO = { page: 2, limit: 5 };
      const rejectionValue = { message: 'Something weird happened', code: 500 };
      mockUserRepository.findAll.mockRejectedValueOnce(rejectionValue);

      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      getAllUsers.on('SUCCESS', successHandler);
      getAllUsers.on('ERROR', errorHandler);

      // Act
      await getAllUsers.execute(input);

      // Assert
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).not.toHaveBeenCalled();
      expect(mockUserRepository.findAll).toHaveBeenCalledWith(input.page, input.limit);

      // Check the emitted error details
      const emittedError = errorHandler.mock.calls[0][0] as OperationError;
      expect(emittedError).toBeInstanceOf(OperationError);
      expect(emittedError.code).toBe('GET_USERS_ERROR');
      expect(emittedError.message).toBe('Unknown error occurred'); // Uses default message for non-Errors
      expect(emittedError.details).toBe(rejectionValue); // Check if the original value is attached
    });

    it('should log error details when an error occurs', async () => {
      // Arrange
      const input: GetAllUsersInputDTO = { page: 1, limit: 10 };
      const expectedError = new Error('Logging test error');
      mockUserRepository.findAll.mockRejectedValueOnce(expectedError);

      const errorHandler = jest.fn();
      getAllUsers.on('ERROR', errorHandler); // Need to attach listener even if not asserting it directly

      // Act
      await getAllUsers.execute(input);

      // Assert
      // BaseOperation automatically logs errors when emitError is called if a logger is provided
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation GetAllUsers failed'),
        expect.objectContaining({
          error: expect.any(OperationError)
        })
      );
    });
  });
});
