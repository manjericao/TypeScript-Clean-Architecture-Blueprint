import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { GetUserInputDTO } from '@enterprise/dto/input/user';
import { UserResponseDTO } from '@enterprise/dto/output';
import { OperationError } from '@application/use_cases/base';
import { UserRole } from '@enterprise/enum';
import { GetUser } from '@application/use_cases/user'; // Assuming GetUser use case file exists

// --- Mocks ---

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

// --- Helper Function ---

const createFakeUserResponse = (id?: string, email?: string): UserResponseDTO => ({
  id: id ?? faker.string.uuid(),
  username: faker.internet.username(),
  name: faker.person.fullName(),
  email: email ?? faker.internet.email(),
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  isVerified: faker.datatype.boolean(),
});

// --- Test Suite ---

describe('GetUser Use Case', () => {
  let getUser: GetUser;
  let inputDTO: GetUserInputDTO;
  let fakeUser: UserResponseDTO;

  // Mock event handlers
  let onSuccess: jest.Mock;
  let onError: jest.Mock;
  let onNotFound: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();

    // Instantiate the use case with mocks
    getUser = new GetUser(mockUserRepository, mockLogger);

    // Initialize mock event handlers
    onSuccess = jest.fn();
    onError = jest.fn();
    onNotFound = jest.fn();

    // Attach mock handlers to the use case instance
    getUser.on('SUCCESS', onSuccess);
    getUser.on('ERROR', onError);
    getUser.on('NOTFOUND_ERROR', onNotFound);

    // Prepare default fake data
    fakeUser = createFakeUserResponse();
  });

  // --- Test Cases ---

  describe('execute', () => {
    it('should emit SUCCESS with user data when found by ID', async () => {
      // Arrange
      inputDTO = { id: fakeUser.id }; // Only provide ID
      mockUserRepository.findById.mockResolvedValue(fakeUser);

      // Act
      await getUser.execute(inputDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeUser.id);
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled(); // Should not search by email if ID found

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(fakeUser);
      expect(onNotFound).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('GetUser succeeded'), expect.any(Object));
      expect(mockLogger.warn).not.toHaveBeenCalled();
      // BaseOperation logs errors, so only check error log if an error is expected
    });

    it('should emit SUCCESS with user data when found by email (ID not provided)', async () => {
      // Arrange
      inputDTO = { email: fakeUser.email }; // Only provide email
      mockUserRepository.findByEmail.mockResolvedValue(fakeUser);

      // Act
      await getUser.execute(inputDTO);

      // Assert
      expect(mockUserRepository.findById).not.toHaveBeenCalled(); // Should not search by ID
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeUser.email);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(fakeUser);
      expect(onNotFound).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('GetUser succeeded'), expect.any(Object));
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should emit SUCCESS with user data when found by email after ID lookup fails', async () => {
      // Arrange
      const searchId = faker.string.uuid();
      inputDTO = { id: searchId, email: fakeUser.email }; // Provide both, but ID will fail
      mockUserRepository.findById.mockResolvedValue(undefined); // Simulate ID not found
      mockUserRepository.findByEmail.mockResolvedValue(fakeUser); // Email will be found

      // Act
      await getUser.execute(inputDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(searchId);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeUser.email);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(fakeUser);
      expect(onNotFound).not.toHaveBeenCalled(); // Not emitted if eventually found by email
      expect(onError).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('GetUser succeeded'), expect.any(Object));
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should emit NOTFOUND_ERROR when user is not found by ID (email not provided)', async () => {
      // Arrange
      inputDTO = { id: fakeUser.id }; // Only provide ID
      const expectedMessage = `User not found with the provided criteria: ID ${fakeUser.id}.`;
      mockUserRepository.findById.mockResolvedValue(undefined); // Simulate ID not found

      // Act
      await getUser.execute(inputDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeUser.id);
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();

      expect(onNotFound).toHaveBeenCalledTimes(1);
      expect(onNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('GetUser failed: User not found'), expect.any(Object));
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('GetUser succeeded'));
    });

    it('should emit NOTFOUND_ERROR when user is not found by email (ID not provided)', async () => {
      // Arrange
      inputDTO = { email: fakeUser.email }; // Only provide email
      const expectedMessage = `User not found with the provided criteria: Email ${fakeUser.email}.`;
      mockUserRepository.findByEmail.mockResolvedValue(undefined); // Simulate email not found

      // Act
      await getUser.execute(inputDTO);

      // Assert
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeUser.email);

      expect(onNotFound).toHaveBeenCalledTimes(1);
      expect(onNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('GetUser failed: User not found'), expect.any(Object));
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('GetUser succeeded'));
    });

    it('should emit NOTFOUND_ERROR when user is not found by ID nor by email', async () => {
      // Arrange
      inputDTO = { id: fakeUser.id, email: fakeUser.email }; // Provide both
      const expectedMessage = `User not found with the provided criteria: ID ${fakeUser.id} or Email ${fakeUser.email}.`;
      mockUserRepository.findById.mockResolvedValue(undefined); // Simulate ID not found
      mockUserRepository.findByEmail.mockResolvedValue(undefined); // Simulate email not found

      // Act
      await getUser.execute(inputDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeUser.id);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeUser.email);

      expect(onNotFound).toHaveBeenCalledTimes(1);
      expect(onNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('GetUser failed: User not found'), expect.any(Object));
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('GetUser succeeded'));
    });

    it('should emit ERROR when findById throws an error', async () => {
      // Arrange
      inputDTO = { id: fakeUser.id };
      const repositoryError = new Error('Database connection error');
      mockUserRepository.findById.mockRejectedValue(repositoryError);

      // Act
      await getUser.execute(inputDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeUser.id);
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'GET_USER_FAILED',
        message: repositoryError.message,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onNotFound).not.toHaveBeenCalled();

      // BaseOperation logs the error when emitError is called
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation GetUser failed'),
        expect.objectContaining({ error: expect.any(OperationError) })
      );
    });

    it('should emit ERROR when findByEmail throws an error (after findById fails)', async () => {
      // Arrange
      inputDTO = { id: fakeUser.id, email: fakeUser.email }; // Provide both
      const repositoryError = new Error('Email index lookup failed');
      mockUserRepository.findById.mockResolvedValue(undefined); // ID lookup fails first
      mockUserRepository.findByEmail.mockRejectedValue(repositoryError); // Then email lookup throws

      // Act
      await getUser.execute(inputDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(fakeUser.id);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeUser.email);


      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'GET_USER_FAILED',
        message: repositoryError.message,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onNotFound).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation GetUser failed'),
        expect.objectContaining({ error: expect.any(OperationError) })
      );
    });

    it('should emit ERROR when findByEmail throws an error (ID not provided)', async () => {
      // Arrange
      inputDTO = { email: fakeUser.email }; // Only email provided
      const repositoryError = new Error('Email index lookup failed');
      mockUserRepository.findByEmail.mockRejectedValue(repositoryError);

      // Act
      await getUser.execute(inputDTO);

      // Assert
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(fakeUser.email);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'GET_USER_FAILED',
        message: repositoryError.message,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onNotFound).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation GetUser failed'),
        expect.objectContaining({ error: expect.any(OperationError) })
      );
    });
  });
});
