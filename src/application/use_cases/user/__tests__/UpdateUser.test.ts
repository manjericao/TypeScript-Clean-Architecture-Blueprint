import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { GetUserInputDTO, UpdateUserDTO } from '@enterprise/dto/input/user';
import { UserResponseDTO } from '@enterprise/dto/output';
import { OperationError } from '@application/use_cases/base';
import { UserRole } from '@enterprise/enum';
import { UpdateUser } from '@application/use_cases/user'; // Adjust path if necessary

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

// --- Helper Functions ---

const createFakeUserResponseDTO = (id?: string, overrides: Partial<UserResponseDTO> = {}): UserResponseDTO => ({
  id: id ?? faker.string.uuid(),
  username: faker.internet.username(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  isVerified: faker.datatype.boolean(),
  ...overrides,
});

const createFakeUpdateUserDTO = (overrides: Partial<UpdateUserDTO> = {}): UpdateUserDTO => ({
  name: faker.person.fullName(),
  email: faker.internet.email(),
  username: faker.internet.username(),
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  ...overrides,
});

// --- Test Suite ---

describe('UpdateUser Use Case', () => {
  let updateUser: UpdateUser;
  let existingUser: UserResponseDTO;
  let userInputDTO: GetUserInputDTO;
  let updateDataDTO: UpdateUserDTO;

  // Mock event handlers
  let onSuccess: jest.Mock;
  let onError: jest.Mock;
  let onUserNotFound: jest.Mock;
  let onEmailTaken: jest.Mock;
  let onUsernameTaken: jest.Mock;
  // Remove VALIDATION_ERROR handler as it's not explicitly defined in the provided UpdateUser code
  // let onValidationError: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();

    // Instantiate the use case with mocks
    updateUser = new UpdateUser(mockUserRepository, mockLogger);

    // Initialize mock event handlers
    onSuccess = jest.fn();
    onError = jest.fn();
    onUserNotFound = jest.fn();
    onEmailTaken = jest.fn();
    onUsernameTaken = jest.fn();
    // onValidationError = jest.fn(); // Removed

    // Attach mock handlers to the use case instance
    updateUser.on('SUCCESS', onSuccess);
    updateUser.on('ERROR', onError);
    updateUser.on('USER_NOT_FOUND', onUserNotFound);
    updateUser.on('EMAIL_TAKEN', onEmailTaken);
    updateUser.on('USERNAME_TAKEN', onUsernameTaken);
    // updateUser.on('VALIDATION_ERROR', onValidationError); // Removed

    // Prepare default fake data
    existingUser = createFakeUserResponseDTO();
    userInputDTO = { id: existingUser.id }; // Input to identify the user
    updateDataDTO = createFakeUpdateUserDTO({ // Ensure updates differ from existing
      name: `Updated ${existingUser.name}`,
      email: `updated.${existingUser.email}`,
      username: `updated_${existingUser.username}`
    });
  });

  // --- Test Cases ---

  describe('execute', () => {
    it('should emit SUCCESS with updated user data when user exists and updates are valid', async () => {
      // Arrange
      const updatedUserResponse = { ...existingUser, ...updateDataDTO, id: existingUser.id }; // Simulate repository response
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByEmail.mockResolvedValue(undefined); // Assume new email is not taken
      mockUserRepository.findByUsername.mockResolvedValue(undefined); // Assume new username is not taken
      mockUserRepository.update.mockResolvedValue(updatedUserResponse);

      // Act
      await updateUser.execute(userInputDTO, updateDataDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(existingUser.id);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(updateDataDTO.email);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(updateDataDTO.username);
      expect(mockUserRepository.update).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.update).toHaveBeenCalledWith(existingUser.id, updateDataDTO);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(updatedUserResponse);
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();
      // expect(onValidationError).not.toHaveBeenCalled(); // Removed

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('UpdateUser operation started'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking if user exists'), { userId: existingUser.id });
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking for conflicting email'), { userId: existingUser.id });
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking for conflicting username'), { userId: existingUser.id });
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Attempting to update user in repository'), { userId: existingUser.id, updates: updateDataDTO });
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('UpdateUser succeeded'), { userId: existingUser.id });
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should emit SUCCESS when updating fields other than email or username', async () => {
      // Arrange
      const nonConflictUpdateData: UpdateUserDTO = { name: 'New Name Only' };
      const updatedUserResponse = { ...existingUser, ...nonConflictUpdateData, id: existingUser.id };
      mockUserRepository.findById.mockResolvedValue(existingUser);
      // findByEmail and findByUsername should not be called if email/username are not in updates
      mockUserRepository.update.mockResolvedValue(updatedUserResponse);

      // Act
      await updateUser.execute(userInputDTO, nonConflictUpdateData);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(existingUser.id);
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled(); // Not called
      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled(); // Not called
      expect(mockUserRepository.update).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.update).toHaveBeenCalledWith(existingUser.id, nonConflictUpdateData);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(updatedUserResponse);
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('UpdateUser operation started'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking if user exists'), expect.any(Object));
      // No conflicting email/username debug logs
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Attempting to update user'), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('UpdateUser succeeded'), expect.any(Object));
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should emit SUCCESS when updating email to one already used by the *same* user', async () => {
      // Arrange
      const sameEmailUpdateData: UpdateUserDTO = { email: existingUser.email }; // Same email
      // Update should still be called, even if only other fields changed or just to update timestamps
      const updatedUserResponse = { ...existingUser, ...sameEmailUpdateData, id: existingUser.id };
      mockUserRepository.findById.mockResolvedValue(existingUser);
      // findByEmail will not be called because updates.email === existingUser.email
      mockUserRepository.update.mockResolvedValue(updatedUserResponse);

      // Act
      await updateUser.execute(userInputDTO, sameEmailUpdateData);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled(); // Not called due to same email check
      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled(); // Assuming username wasn't updated
      expect(mockUserRepository.update).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.update).toHaveBeenCalledWith(existingUser.id, sameEmailUpdateData);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(updatedUserResponse);
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();
    });

    it('should emit SUCCESS when updating username to one already used by the *same* user', async () => {
      // Arrange
      const sameUsernameUpdateData: UpdateUserDTO = { username: existingUser.username }; // Same username
      // Update should still be called
      const updatedUserResponse = { ...existingUser, ...sameUsernameUpdateData, id: existingUser.id };
      mockUserRepository.findById.mockResolvedValue(existingUser);
      // findByUsername will not be called because updates.username === existingUser.username
      mockUserRepository.update.mockResolvedValue(updatedUserResponse);

      // Act
      await updateUser.execute(userInputDTO, sameUsernameUpdateData);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled(); // Assuming email wasn't updated
      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled(); // Not called due to same username check
      expect(mockUserRepository.update).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.update).toHaveBeenCalledWith(existingUser.id, sameUsernameUpdateData);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(updatedUserResponse);
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();
    });

    it('should emit USER_NOT_FOUND when the user to update does not exist', async () => {
      // Arrange
      const nonExistentUserId = faker.string.uuid();
      userInputDTO = { id: nonExistentUserId };
      const expectedMessage = `User with id ${nonExistentUserId} not found.`;
      mockUserRepository.findById.mockResolvedValue(undefined); // Simulate user not found

      // Act
      await updateUser.execute(userInputDTO, updateDataDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(nonExistentUserId);
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(onUserNotFound).toHaveBeenCalledTimes(1);
      expect(onUserNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('UpdateUser failed: User with id'), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('UpdateUser operation started'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking if user exists'), expect.any(Object));
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should emit EMAIL_TAKEN when the new email is already used by another user', async () => {
      // Arrange
      const conflictingUser = createFakeUserResponseDTO(); // Different user ID
      const expectedMessage = `Email ${updateDataDTO.email} is already in use.`;
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByEmail.mockResolvedValue(conflictingUser); // Email found for DIFFERENT user
      mockUserRepository.findByUsername.mockResolvedValue(undefined); // Assume username is fine

      // Act
      await updateUser.execute(userInputDTO, updateDataDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(existingUser.id);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(updateDataDTO.email);
      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled(); // Short-circuited
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(onEmailTaken).toHaveBeenCalledTimes(1);
      expect(onEmailTaken).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('UpdateUser failed: Email'), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('UpdateUser operation started'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking if user exists'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking for conflicting email'), expect.any(Object));
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should emit USERNAME_TAKEN when the new username is already used by another user', async () => {
      // Arrange
      const conflictingUser = createFakeUserResponseDTO(); // Different user ID
      const expectedMessage = `Username ${updateDataDTO.username} is already taken.`;
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByEmail.mockResolvedValue(undefined); // Assume email is fine
      mockUserRepository.findByUsername.mockResolvedValue(conflictingUser); // Username found for DIFFERENT user

      // Act
      await updateUser.execute(userInputDTO, updateDataDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(existingUser.id);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1); // Email check happens first
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(updateDataDTO.email);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(updateDataDTO.username);
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(onUsernameTaken).toHaveBeenCalledTimes(1);
      expect(onUsernameTaken).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('UpdateUser failed: Username'), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('UpdateUser operation started'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking if user exists'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking for conflicting email'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking for conflicting username'), expect.any(Object));
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    // --- Repository Error Cases ---

    it('should emit ERROR when findById throws an error', async () => {
      // Arrange
      const repositoryError = new Error('Database connection error during findById');
      mockUserRepository.findById.mockRejectedValue(repositoryError);

      // Act
      await updateUser.execute(userInputDTO, updateDataDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'UPDATE_USER_FAILED',
        message: `Failed to update user: ${repositoryError.message}`,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1); // BaseOperation logs on emitError
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation UpdateUser failed'),
        expect.objectContaining({
          operation: 'UpdateUser',
          error: expect.any(OperationError)
        })
      );

    });

    it('should emit ERROR when findByEmail throws an error', async () => {
      // Arrange
      const repositoryError = new Error('Database connection error during findByEmail');
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByEmail.mockRejectedValue(repositoryError); // Error during email check

      // Act
      await updateUser.execute(userInputDTO, updateDataDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1); // Attempted
      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'UPDATE_USER_FAILED',
        message: `Failed to update user: ${repositoryError.message}`,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation UpdateUser failed'),
        expect.objectContaining({
          operation: 'UpdateUser',
          error: expect.any(OperationError)
        })
      );
    });

    it('should emit ERROR when findByUsername throws an error', async () => {
      // Arrange
      const repositoryError = new Error('Database connection error during findByUsername');
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByEmail.mockResolvedValue(undefined); // Email check passes
      mockUserRepository.findByUsername.mockRejectedValue(repositoryError); // Error during username check

      // Act
      await updateUser.execute(userInputDTO, updateDataDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1); // Attempted
      expect(mockUserRepository.update).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'UPDATE_USER_FAILED',
        message: `Failed to update user: ${repositoryError.message}`,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation UpdateUser failed'),
        expect.objectContaining({
          operation: 'UpdateUser',
          error: expect.any(OperationError)
        })
      );
    });

    it('should emit ERROR when update throws an error', async () => {
      // Arrange
      const repositoryError = new Error('Database connection error during update');
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.findByUsername.mockResolvedValue(undefined);
      mockUserRepository.update.mockRejectedValue(repositoryError); // Error during final update

      // Act
      await updateUser.execute(userInputDTO, updateDataDTO);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.update).toHaveBeenCalledTimes(1); // Attempted

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'UPDATE_USER_FAILED',
        message: `Failed to update user: ${repositoryError.message}`,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onEmailTaken).not.toHaveBeenCalled();
      expect(onUsernameTaken).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Operation UpdateUser failed'),
        expect.objectContaining({
          operation: 'UpdateUser',
          error: expect.any(OperationError)
        })
      );
    });
  });
});
