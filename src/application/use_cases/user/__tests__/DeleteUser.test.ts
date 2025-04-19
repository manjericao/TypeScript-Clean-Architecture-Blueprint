import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { IdUserDTO } from '@enterprise/dto/input/user';
import { UserResponseDTO } from '@enterprise/dto/output';
import { AbstractOperation, OperationError } from '@application/use_cases/base';
import { UserRole } from '@enterprise/enum';
import { DeleteUser } from '@application/use_cases/user';
import { UserDeletedEvent } from '@enterprise/events/user';

// Mock dependencies
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

const createFakeUserResponseDTO = (id?: string): UserResponseDTO => ({
  id: id ?? faker.string.uuid(),
  username: faker.internet.username(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  isVerified: faker.datatype.boolean(),
});

describe('DeleteUser Use Case', () => {
  let deleteUser: DeleteUser;
  let userIdDTO: IdUserDTO;
  let fakeUser: UserResponseDTO;

  const publishDomainEventSpy = jest.spyOn(AbstractOperation.prototype as any, 'publishDomainEvent');

  beforeEach(() => {
    jest.resetAllMocks();

    deleteUser = new DeleteUser(mockUserRepository, mockLogger);

    fakeUser = createFakeUserResponseDTO();
    userIdDTO = { id: fakeUser.id }; // Use a valid DTO structure

    // Optional: Clear spies if used
    publishDomainEventSpy.mockClear();
  });

  describe('execute', () => {
    it('should emit SUCCESS when user is found and deleted successfully', async () => {
      // Arrange
      const successPayload = `User with id ${fakeUser.id} was successfully deleted.`;
      mockUserRepository.findById.mockResolvedValue(fakeUser);
      mockUserRepository.delete.mockResolvedValue(undefined); // Assume delete resolves on success

      const onSuccess = jest.fn();
      const onError = jest.fn();
      const onNotFound = jest.fn();

      deleteUser.on('SUCCESS', onSuccess);
      deleteUser.on('ERROR', onError);
      deleteUser.on('NOTFOUND_ERROR', onNotFound);

      // Act
      await deleteUser.execute(userIdDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userIdDTO.id);
      expect(mockUserRepository.delete).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.delete).toHaveBeenCalledWith(fakeUser.id);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Published UserDeletedEvent'), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted user'), expect.any(Object));
      expect(mockLogger.warn).not.toHaveBeenCalled(); // No warnings expected
      expect(mockLogger.error).not.toHaveBeenCalled(); // No errors expected via logger in success path

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(successPayload);
      expect(onError).not.toHaveBeenCalled();
      expect(onNotFound).not.toHaveBeenCalled();

      // Optional: Verify domain event publication if spy is set up
      expect(publishDomainEventSpy).toHaveBeenCalledWith(expect.any(UserDeletedEvent));
      expect(publishDomainEventSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: fakeUser.id }));
    });

    it('should emit NOTFOUND_ERROR when user is not found by repository', async () => {
      // Arrange
      const notFoundId = faker.string.uuid();
      userIdDTO = { id: notFoundId };
      const expectedMessage = `User with id ${notFoundId} was not found.`;
      mockUserRepository.findById.mockResolvedValue(undefined); // Simulate user not found

      const onSuccess = jest.fn();
      const onError = jest.fn();
      const onNotFound = jest.fn();

      deleteUser.on('SUCCESS', onSuccess);
      deleteUser.on('ERROR', onError);
      deleteUser.on('NOTFOUND_ERROR', onNotFound);

      // Act
      await deleteUser.execute(userIdDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(notFoundId);
      expect(mockUserRepository.delete).not.toHaveBeenCalled(); // Delete should not be called

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('DeleteUser failed: User not found'),
        { userId: notFoundId }
      );
      expect(mockLogger.info).not.toHaveBeenCalled(); // No info logs expected
      expect(mockLogger.error).not.toHaveBeenCalled(); // No errors expected via logger

      expect(onNotFound).toHaveBeenCalledTimes(1);
      expect(onNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      // Optional: Verify domain event not published
      expect(publishDomainEventSpy).not.toHaveBeenCalled();
    });

    it('should emit NOTFOUND_ERROR when found user data is invalid (e.g., missing id)', async () => {
      // Arrange
      const invalidUserData = { ...createFakeUserResponseDTO(userIdDTO.id), id: undefined as any }; // Simulate invalid data from repo
      const expectedMessage = `User with id ${userIdDTO.id} was not found.`;
      mockUserRepository.findById.mockResolvedValue(invalidUserData);

      const onSuccess = jest.fn();
      const onError = jest.fn();
      const onNotFound = jest.fn();

      deleteUser.on('SUCCESS', onSuccess);
      deleteUser.on('ERROR', onError);
      deleteUser.on('NOTFOUND_ERROR', onNotFound);

      // Act
      await deleteUser.execute(userIdDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userIdDTO.id);
      expect(mockUserRepository.delete).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('DeleteUser failed: User not found'),
        { userId: userIdDTO.id }
      );

      expect(onNotFound).toHaveBeenCalledTimes(1);
      expect(onNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('should emit ERROR when user repository findById method throws an error', async () => {
      // Arrange
      const repositoryError = new Error('Database connection error');
      mockUserRepository.findById.mockRejectedValue(repositoryError);

      const onSuccess = jest.fn();
      const onError = jest.fn();
      const onNotFound = jest.fn();

      deleteUser.on('SUCCESS', onSuccess);
      deleteUser.on('ERROR', onError);
      deleteUser.on('NOTFOUND_ERROR', onNotFound);

      // Act
      await deleteUser.execute(userIdDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userIdDTO.id);
      expect(mockUserRepository.delete).not.toHaveBeenCalled(); // Delete should not be attempted

      expect(mockLogger.error).toHaveBeenCalledTimes(1); // BaseOperation handles logging on emitError
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation DeleteUser failed'),
        expect.objectContaining({
          error: expect.any(OperationError)
        })
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'DELETE_USER_FAILED',
        message: repositoryError.message,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onNotFound).not.toHaveBeenCalled();
    });

    it('should emit ERROR when user repository delete method throws an error', async () => {
      // Arrange
      const repositoryError = new Error('Deletion conflict');
      mockUserRepository.findById.mockResolvedValue(fakeUser);
      mockUserRepository.delete.mockRejectedValue(repositoryError);

      const onSuccess = jest.fn();
      const onError = jest.fn();
      const onNotFound = jest.fn();

      deleteUser.on('SUCCESS', onSuccess);
      deleteUser.on('ERROR', onError);
      deleteUser.on('NOTFOUND_ERROR', onNotFound);

      // Act
      await deleteUser.execute(userIdDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userIdDTO.id);
      expect(mockUserRepository.delete).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.delete).toHaveBeenCalledWith(fakeUser.id);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Published UserDeletedEvent'), expect.any(Object)); // Event published before delete fails
      expect(mockLogger.error).toHaveBeenCalledTimes(1); // BaseOperation handles logging on emitError
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation DeleteUser failed'),
        expect.objectContaining({
          error: expect.any(OperationError)
        })
      );


      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'DELETE_USER_FAILED',
        message: repositoryError.message,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onNotFound).not.toHaveBeenCalled();
    });
  });
});
