import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { AbstractOperation, OperationError } from '@application/use_cases/base';
import { CreateUserDTO } from '@enterprise/dto/input/user';
import { UserResponseDTO } from '@enterprise/dto/output';
import { UserRole, Gender } from '@enterprise/enum';
import { CreateUser } from '@application/use_cases/user';
import { UserCreatedEvent } from '@enterprise/events/user';

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

// Spy on the protected method in the base class
const publishDomainEventSpy = jest.spyOn(AbstractOperation.prototype as any, 'publishDomainEvent');

// --- Helper Functions ---

const createFakeUserDTO = (): CreateUserDTO => {
  const password = faker.internet.password();
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    username: faker.internet.userName(),
    password: password,
    repeatPassword: password, // Passwords match by default
    role: faker.helpers.arrayElement(Object.values(UserRole)),
    birthDate: faker.date.past({ years: 30 }),
    gender: faker.helpers.arrayElement(Object.values(Gender)),
  };
};

const createFakeUserResponseDTO = (input: CreateUserDTO, id?: string): UserResponseDTO => ({
  id: id ?? faker.string.uuid(),
  username: input.username,
  name: input.name,
  email: input.email,
  role: input.role,
  isVerified: false, // Assuming default is false on creation
});

// --- Test Suite ---

describe('CreateUser Use Case', () => {
  let createUser: CreateUser;
  let userDTO: CreateUserDTO;
  let fakeUserResponse: UserResponseDTO;
  let hashedPassword = 'hashed_password';

  // Mock event handlers
  let onSuccess: jest.Mock;
  let onError: jest.Mock;
  let onValidationError: jest.Mock;
  let onUserExists: jest.Mock;

  beforeEach(() => {
    // Reset mocks and spies before each test
    jest.resetAllMocks();
    publishDomainEventSpy.mockClear();

    // Instantiate the use case with mocks
    createUser = new CreateUser(mockUserRepository, mockPasswordHasher, mockLogger);

    // Initialize mock event handlers
    onSuccess = jest.fn();
    onError = jest.fn();
    onValidationError = jest.fn();
    onUserExists = jest.fn();

    // Attach mock handlers to the use case instance
    createUser.on('SUCCESS', onSuccess);
    createUser.on('ERROR', onError);
    createUser.on('VALIDATION_ERROR', onValidationError);
    createUser.on('USER_EXISTS', onUserExists);

    // Prepare default fake data
    userDTO = createFakeUserDTO();
    fakeUserResponse = createFakeUserResponseDTO(userDTO);
    hashedPassword = `hashed_${userDTO.password}`; // Make hash unique per test run if needed
  });

  // --- Test Cases ---

  describe('execute', () => {
    it('should emit SUCCESS with created user data when input is valid and user does not exist', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.findByUsername.mockResolvedValue(undefined);
      mockPasswordHasher.hashPassword.mockResolvedValue(hashedPassword);
      mockUserRepository.create.mockResolvedValue(fakeUserResponse);

      // Act
      await createUser.execute(userDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(userDTO.email);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(userDTO.username);
      expect(mockPasswordHasher.hashPassword).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.hashPassword).toHaveBeenCalledWith(userDTO.password);
      expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        ...userDTO,
        password: hashedPassword,
        repeatPassword: hashedPassword, // Should use the hashed password here as well
      });

      expect(publishDomainEventSpy).toHaveBeenCalledTimes(1);
      expect(publishDomainEventSpy).toHaveBeenCalledWith(expect.any(UserCreatedEvent));
      expect(publishDomainEventSpy).toHaveBeenCalledWith(expect.objectContaining({ user: fakeUserResponse }));

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(fakeUserResponse);
      expect(onError).not.toHaveBeenCalled();
      expect(onValidationError).not.toHaveBeenCalled();
      expect(onUserExists).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('CreateUser operation started'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking for existing user'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Hashing password'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Attempting to create user'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Published UserCreatedEvent'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('CreateUser succeeded'), expect.any(Object));
      expect(mockLogger.warn).not.toHaveBeenCalled();
      // Only check error logs when an error is expected
    });

    it('should emit VALIDATION_ERROR when passwords do not match', async () => {
      // Arrange
      const invalidUserDTO = { ...userDTO, repeatPassword: 'differentPassword' };
      const expectedMessage = 'Passwords do not match.';

      // Act
      await createUser.execute(invalidUserDTO);

      // Assert
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.findByUsername).not.toHaveBeenCalled();
      expect(mockPasswordHasher.hashPassword).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onValidationError).toHaveBeenCalledTimes(1);
      expect(onValidationError).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onUserExists).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('CreateUser validation failed: Passwords do not match'), expect.any(Object));
    });

    it('should emit USER_EXISTS when email already exists', async () => {
      // Arrange
      const existingUser = createFakeUserResponseDTO(createFakeUserDTO()); // Simulate some existing user
      mockUserRepository.findByEmail.mockResolvedValue(existingUser);
      mockUserRepository.findByUsername.mockResolvedValue(undefined); // Username is available
      const expectedMessage = `User with email ${userDTO.email} already exists.`;

      // Act
      await createUser.execute(userDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(userDTO.email);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1); // Still checks username
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(userDTO.username);
      expect(mockPasswordHasher.hashPassword).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onUserExists).toHaveBeenCalledTimes(1);
      expect(onUserExists).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onValidationError).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('CreateUser failed: User with email'));
    });

    it('should emit USER_EXISTS when username already exists', async () => {
      // Arrange
      const existingUser = createFakeUserResponseDTO(createFakeUserDTO()); // Simulate some existing user
      mockUserRepository.findByEmail.mockResolvedValue(undefined); // Email is available
      mockUserRepository.findByUsername.mockResolvedValue(existingUser);
      const expectedMessage = `Username ${userDTO.username} is already taken.`;

      // Act
      await createUser.execute(userDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(userDTO.email);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(userDTO.username);
      expect(mockPasswordHasher.hashPassword).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onUserExists).toHaveBeenCalledTimes(1);
      expect(onUserExists).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onValidationError).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('CreateUser failed: Username'));
    });

    it('should emit ERROR when findByEmail throws an error', async () => {
      // Arrange
      const repositoryError = new Error('Database connection error during findByEmail');
      mockUserRepository.findByEmail.mockRejectedValue(repositoryError);
      // findByUsername might resolve or reject, Promise.all will reject regardless
      mockUserRepository.findByUsername.mockResolvedValue(undefined);

      // Act
      await createUser.execute(userDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1); // Promise.all ensures both are attempted
      expect(mockPasswordHasher.hashPassword).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'CREATE_USER_FAILED',
        message: `Failed to create user: ${repositoryError.message}`,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onValidationError).not.toHaveBeenCalled();
      expect(onUserExists).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('CreateUser failed unexpectedly'),
        expect.objectContaining({ error: repositoryError })
      );
    });

    it('should emit ERROR when findByUsername throws an error', async () => {
      // Arrange
      const repositoryError = new Error('Database connection error during findByUsername');
      mockUserRepository.findByEmail.mockResolvedValue(undefined); // Assume email check passes
      mockUserRepository.findByUsername.mockRejectedValue(repositoryError);

      // Act
      await createUser.execute(userDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.hashPassword).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'CREATE_USER_FAILED',
        message: `Failed to create user: ${repositoryError.message}`,
        details: repositoryError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onValidationError).not.toHaveBeenCalled();
      expect(onUserExists).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('CreateUser failed unexpectedly'),
        expect.objectContaining({ error: repositoryError })
      );
    });

    it('should emit ERROR when passwordHasher.hashPassword throws an error', async () => {
      // Arrange
      const hasherError = new Error('Hashing algorithm failed');
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.findByUsername.mockResolvedValue(undefined);
      mockPasswordHasher.hashPassword.mockRejectedValue(hasherError);

      // Act
      await createUser.execute(userDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.hashPassword).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'CREATE_USER_FAILED',
        message: `Failed to create user: ${hasherError.message}`,
        details: hasherError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onValidationError).not.toHaveBeenCalled();
      expect(onUserExists).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('CreateUser failed unexpectedly'),
        expect.objectContaining({ error: hasherError })
      );
    });

    it('should emit ERROR when userRepository.create throws an error', async () => {
      // Arrange
      const createError = new Error('Database insert failed');
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.findByUsername.mockResolvedValue(undefined);
      mockPasswordHasher.hashPassword.mockResolvedValue(hashedPassword);
      mockUserRepository.create.mockRejectedValue(createError);

      // Act
      await createUser.execute(userDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledTimes(1);
      expect(mockPasswordHasher.hashPassword).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
      // Domain event is published *after* create succeeds in the original code, so it shouldn't be called here.
      expect(publishDomainEventSpy).not.toHaveBeenCalled();


      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: 'CREATE_USER_FAILED',
        message: `Failed to create user: ${createError.message}`,
        details: createError,
      }));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onValidationError).not.toHaveBeenCalled();
      expect(onUserExists).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('CreateUser failed unexpectedly'),
        expect.objectContaining({ error: createError })
      );
    });
  });
});
