import { CreateUser } from '../CreateUser';
import { CreateUserDTO } from '@enterprise/dto/input/user';
import { UserRole, Gender } from '@enterprise/enum';
import { validate, ValidationError } from 'class-validator';
import { faker } from '@faker-js/faker';
import { ILogger } from '@application/contracts/infrastructure';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { IUserRepository } from '@application/contracts/domain/repositories';

jest.mock('class-validator', () => ({
  validate: jest.fn().mockResolvedValue([])  // Default to empty validation errors
}));

const generateTestUser = () => {
  const password = faker.internet.password({ length: 12, pattern: /[A-Za-z0-9!]/});
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    username: faker.internet.username(),
    password: password,
    repeatPassword: password,
    role: UserRole.USER,
    birthDate: faker.date.past(),
    gender: faker.helpers.arrayElement([Gender.MALE, Gender.FEMALE,]),
  } as CreateUserDTO;
};

describe('CreateUser', () => {
  let createUser: CreateUser;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let mockLogger: jest.Mocked<ILogger>;
  let validUserDTO: CreateUserDTO;

  const mockValidate = jest.fn() as jest.MockedFunction<typeof validate>;

  beforeEach(() => {
    validUserDTO = generateTestUser();

    mockUserRepository = {
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      create: jest.fn(),
    } as any;

    mockPasswordHasher = {
      hashPassword: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
    } as any;

    (validate as jest.MockedFunction<typeof validate>).mockClear();
    mockValidate.mockResolvedValue([] as ValidationError[]);

    createUser = new CreateUser(
      mockUserRepository,
      mockPasswordHasher,
      mockLogger
    );
  });

  describe('execute', () => {
    it('should successfully create a user when all inputs are valid', async () => {
      const hashedPassword = 'hashedPassword123';
      mockValidate.mockResolvedValue([]);
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.findByUsername.mockResolvedValue(undefined);
      mockPasswordHasher.hashPassword.mockResolvedValue(hashedPassword);
      mockUserRepository.create.mockResolvedValue({ ...validUserDTO, id: '123', isVerified: false });

      const successSpy = jest.spyOn(createUser as any, 'emitOutput');

      await createUser.execute(validUserDTO);

      expect(mockLogger.info).toHaveBeenCalledWith('Creating new user', { email: validUserDTO.email });
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(validUserDTO.email);
      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(validUserDTO.username);
      expect(mockPasswordHasher.hashPassword).toHaveBeenCalledWith(validUserDTO.password);
      expect(mockUserRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        ...validUserDTO,
        password: hashedPassword,
        repeat_password: hashedPassword
      }));
      expect(successSpy).toHaveBeenCalledWith('SUCCESS', expect.objectContaining({ id: '123' }));
    });

    it('should emit validation error when DTO validation fails', async () => {
      const validationErrors = [{
        property: 'email',
        constraints: { isEmail: 'Invalid email' },
        target: validUserDTO,
        value: validUserDTO.email,
        children: []
      }];

      (validate as jest.Mock).mockResolvedValueOnce(validationErrors);

      const errorSpy = jest.spyOn(createUser as any, 'emitOutput');

      await createUser.execute(validUserDTO);

      expect(errorSpy).toHaveBeenCalledWith('VALIDATION_ERROR', validationErrors);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should emit user exists error when email already exists', async () => {
      // Arrange
      mockValidate.mockResolvedValue([]);
      mockUserRepository.findByEmail.mockResolvedValue({
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        username: 'johndoe',
        role: UserRole.USER,
        isVerified: false // Required property
      });

      const errorSpy = jest.spyOn(createUser as any, 'emitOutput');

      // Act
      await createUser.execute(validUserDTO);

      // Assert
      expect(errorSpy).toHaveBeenCalledWith('USER_EXISTS', `User with email ${validUserDTO.email} already exists`);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should emit user exists error when username already exists', async () => {
      // Arrange
      mockValidate.mockResolvedValue([]);
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.findByUsername.mockResolvedValue({
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        username: 'johndoe',
        role: UserRole.USER,
        isVerified: false
      });

      const errorSpy = jest.spyOn(createUser as any, 'emitOutput');

      // Act
      await createUser.execute(validUserDTO);

      // Assert
      expect(errorSpy).toHaveBeenCalledWith('USER_EXISTS', `Username ${validUserDTO.username} is already taken`);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should emit validation error when passwords do not match', async () => {
      // Arrange
      const userDTOWithMismatchedPasswords = {
        ...validUserDTO,
        repeat_password: 'DifferentPassword123!'
      };
      mockValidate.mockResolvedValue([]);
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.findByUsername.mockResolvedValue(undefined);

      const errorSpy = jest.spyOn(createUser as any, 'emitOutput');

      // Act
      await createUser.execute(userDTOWithMismatchedPasswords);

      // Assert
      expect(errorSpy).toHaveBeenCalledWith('VALIDATION_ERROR', 'Passwords do not match');
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should handle and emit errors during user creation', async () => {
      // Arrange
      const error = new Error('Database error');
      mockValidate.mockResolvedValue([]);
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.findByUsername.mockResolvedValue(undefined);
      mockPasswordHasher.hashPassword.mockResolvedValue('hashedPassword');
      mockUserRepository.create.mockRejectedValue(error);

      const errorSpy = jest.spyOn(createUser as any, 'emitOutput');

      // Act
      await createUser.execute(validUserDTO);

      // Assert
      expect(errorSpy).toHaveBeenCalledWith('ERROR', error);
    });

    it('should handle non-Error objects in catch block', async () => {
      // Arrange
      const errorString = 'String error';
      mockValidate.mockResolvedValue([]);
      mockUserRepository.findByEmail.mockResolvedValue(undefined);
      mockUserRepository.findByUsername.mockResolvedValue(undefined);
      mockPasswordHasher.hashPassword.mockRejectedValue(errorString);

      const errorSpy = jest.spyOn(createUser as any, 'emitOutput');

      // Act
      await createUser.execute(validUserDTO);

      // Assert
      expect(errorSpy).toHaveBeenCalledWith('ERROR', new Error(errorString));
    });
  });
});
