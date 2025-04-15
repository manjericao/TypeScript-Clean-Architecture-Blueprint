import { UpdateUser } from '@application/use_cases/user/UpdateUser';
import { UserResponseDTO } from '@enterprise/dto/output';
import { UserRole, Gender } from '@enterprise/enum';
import { faker } from '@faker-js/faker';
import { validate } from 'class-validator';
import { UpdateUserDTO } from '@enterprise/dto/input/user';
import { ILogger } from '@application/contracts/infrastructure';
import { IUserRepository } from '@application/contracts/domain/repositories';

// Mock external dependencies
jest.mock('class-validator');

describe('UpdateUser', () => {
  // Test setup variables
  let updateUser: UpdateUser;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockLogger: jest.Mocked<ILogger>;

  // Sample data
  const userId = faker.string.uuid();
  const mockExistingUser: UserResponseDTO = {
    id: userId,
    name: faker.person.fullName(),
    email: faker.internet.email(),
    username: faker.internet.username(),
    role: UserRole.USER,
    birthDate: faker.date.past(),
    gender: Gender.FEMALE,
    isVerified: false
  };

  // Setup before each test
  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findByAll: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn()
    } as unknown as jest.Mocked<IUserRepository>;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as unknown as jest.Mocked<ILogger>;

    (validate as jest.Mock).mockResolvedValue([]);

    updateUser = new UpdateUser(mockUserRepository, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully update a user', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      name: faker.person.fullName(),
      isVerified: true
    };

    const updatedUser = {
      ...mockExistingUser,
      ...updates,
      updatedAt: new Date()
    };

    mockUserRepository.findById.mockResolvedValue(mockExistingUser);
    mockUserRepository.update.mockResolvedValue(updatedUser);

    const successSpy = jest.fn();
    updateUser.onTyped('SUCCESS', successSpy);

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith('Updating user', { userId });
    expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
    expect(mockUserRepository.update).toHaveBeenCalledWith(userId, updates);
    expect(mockLogger.info).toHaveBeenCalledWith('User updated successfully', { userId });
    expect(successSpy).toHaveBeenCalledWith(updatedUser);
  });

  it('should emit validation error when update data is invalid', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      email: 'invalid-email'
    };

    const validationErrors = [{ property: 'email', constraints: { isEmail: 'Email must be valid' } }];
    (validate as jest.Mock).mockResolvedValue(validationErrors);

    const validationErrorSpy = jest.fn();
    updateUser.onTyped('VALIDATION_ERROR', validationErrorSpy);

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(validate).toHaveBeenCalledWith(updates);
    expect(validationErrorSpy).toHaveBeenCalledWith(validationErrors);
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it('should emit USER_NOT_FOUND if user does not exist', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      name: faker.person.fullName()
    };

    mockUserRepository.findById.mockResolvedValue(undefined);

    const notFoundSpy = jest.fn();
    updateUser.onTyped('USER_NOT_FOUND', notFoundSpy);

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
    expect(notFoundSpy).toHaveBeenCalledWith(`User with id ${userId} not found`);
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it('should emit EMAIL_TAKEN when email is already in use by another user', async () => {
    // Arrange
    const newEmail = faker.internet.email();
    const updates: UpdateUserDTO = {
      email: newEmail
    };

    const otherUser = {
      ...mockExistingUser,
      id: faker.string.uuid(),
      email: newEmail
    };

    mockUserRepository.findById.mockResolvedValue(mockExistingUser);
    mockUserRepository.findByEmail.mockResolvedValue(otherUser);

    const emailTakenSpy = jest.fn();
    updateUser.onTyped('EMAIL_TAKEN', emailTakenSpy);

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(newEmail);
    expect(emailTakenSpy).toHaveBeenCalledWith(`Email ${newEmail} is already in use`);
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it('should not check email uniqueness if email is not being updated', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      name: faker.person.fullName()
    };

    mockUserRepository.findById.mockResolvedValue(mockExistingUser);
    mockUserRepository.update.mockResolvedValue({ ...mockExistingUser, ...updates });

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
    expect(mockUserRepository.update).toHaveBeenCalled();
  });

  it('should allow updating email to the same value', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      email: mockExistingUser.email
    };

    mockUserRepository.findById.mockResolvedValue(mockExistingUser);
    mockUserRepository.update.mockResolvedValue({ ...mockExistingUser, ...updates });

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
    expect(mockUserRepository.update).toHaveBeenCalled();
  });

  it('should emit USERNAME_TAKEN when username is already in use by another user', async () => {
    // Arrange
    const newUsername = faker.internet.username();
    const updates: UpdateUserDTO = {
      username: newUsername
    };

    const otherUser = {
      ...mockExistingUser,
      id: faker.string.uuid(),
      username: newUsername
    };

    mockUserRepository.findById.mockResolvedValue(mockExistingUser);
    mockUserRepository.findByUsername.mockResolvedValue(otherUser);

    const usernameTakenSpy = jest.fn();
    updateUser.onTyped('USERNAME_TAKEN', usernameTakenSpy);

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(newUsername);
    expect(usernameTakenSpy).toHaveBeenCalledWith(`Username ${newUsername} is already taken`);
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it('should not check username uniqueness if username is not being updated', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      name: faker.person.fullName()
    };

    mockUserRepository.findById.mockResolvedValue(mockExistingUser);
    mockUserRepository.update.mockResolvedValue({ ...mockExistingUser, ...updates });

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(mockUserRepository.findByUsername).not.toHaveBeenCalled();
    expect(mockUserRepository.update).toHaveBeenCalled();
  });

  it('should allow updating username to the same value', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      username: mockExistingUser.username
    };

    mockUserRepository.findById.mockResolvedValue(mockExistingUser);
    mockUserRepository.update.mockResolvedValue({ ...mockExistingUser, ...updates });

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(mockUserRepository.findByUsername).not.toHaveBeenCalled();
    expect(mockUserRepository.update).toHaveBeenCalled();
  });

  it('should handle concurrent updates of email and username', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      email: faker.internet.email(),
      username: faker.internet.username()
    };

    mockUserRepository.findById.mockResolvedValue(mockExistingUser);
    mockUserRepository.findByEmail.mockResolvedValue(undefined);
    mockUserRepository.findByUsername.mockResolvedValue(undefined);
    mockUserRepository.update.mockResolvedValue({ ...mockExistingUser, ...updates });

    const successSpy = jest.fn();
    updateUser.onTyped('SUCCESS', successSpy);

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(updates.email);
    expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(updates.username);
    expect(mockUserRepository.update).toHaveBeenCalledWith(userId, updates);
    expect(successSpy).toHaveBeenCalled();
  });

  it('should emit ERROR when an exception occurs', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      name: faker.person.fullName()
    };

    const testError = new Error('Test error');
    mockUserRepository.findById.mockRejectedValue(testError);

    const errorSpy = jest.fn();
    updateUser.onTyped('ERROR', errorSpy);

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    expect(errorSpy).toHaveBeenCalledWith(testError);
  });

  it('should handle non-Error exceptions and convert them to Error objects', async () => {
    // Arrange
    const updates: UpdateUserDTO = {
      name: faker.person.fullName()
    };

    const errorString = 'String error';
    mockUserRepository.findById.mockRejectedValue(errorString);

    const errorSpy = jest.fn();
    updateUser.onTyped('ERROR', errorSpy);

    // Act
    await updateUser.execute(userId, updates);

    // Assert
    const receivedError = errorSpy.mock.calls[0][0];
    expect(receivedError).toBeInstanceOf(Error);
    expect(receivedError.message).toBe(errorString);
  });
});
