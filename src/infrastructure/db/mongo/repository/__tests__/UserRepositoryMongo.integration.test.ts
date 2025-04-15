import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { UserRepositoryMongo } from '@infrastructure/db/mongo/repository/UserRepositoryMongo';
import { UserRole, Gender } from '@enterprise/enum';
import { Types } from '@interface/types';
import { Container } from 'inversify';
import { CreateUserDTO, UpdateUserDTO } from '@enterprise/dto/input/user';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { User } from '@infrastructure/db/mongo/models/UserMongo';
import { faker } from '@faker-js/faker';

describe('UserRepositoryMongo', () => {
  let mongoContainer: StartedTestContainer;
  let mongoUri: string;
  let userRepository: UserRepositoryMongo;
  let container: Container;
  let connection: mongoose.Connection;

  // Helper function to generate a valid user DTO
  const generateUserDTO = (): CreateUserDTO => {
    // Generate a secure password that meets your requirements
    const password = `${faker.internet.password({ length: 8, memorable: true })}A1!`;

    return {
      name: faker.person.firstName().replace(/[^a-zA-Z0-9]/g, ''), // Ensure alphanumeric
      email: faker.internet.email(),
      username: faker.internet.username().replace(/[^a-zA-Z0-9]/g, ''),
      password: password,
      repeatPassword: password,
      role: faker.helpers.arrayElement(Object.values(UserRole)),
      birthDate: faker.date.past({ years: 30 }),
      gender: faker.helpers.arrayElement(Object.values(Gender))
    };
  };

  // Setup remains the same
  beforeAll(async () => {
    // Start MongoDB container
    mongoContainer = await new GenericContainer('mongo:6.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage('Waiting for connections'))
      .start();

    // Get connection URI for MongoDB
    const mongoPort = mongoContainer.getMappedPort(27017);
    const mongoHost = mongoContainer.getHost();
    mongoUri = `mongodb://${mongoHost}:${mongoPort}/testdb`;

    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    connection = mongoose.connection;

    // Create a new container for each test
    container = new Container();
    container.bind(Types.UserModel).toConstantValue(User);
    container.bind(Types.UserRepository).to(UserRepositoryMongo);

    userRepository = container.get<UserRepositoryMongo>(Types.UserRepository);
  }, 60000);

  // Rest of setup remains the same
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoContainer.stop();
  });

  beforeEach(async () => {
    if (connection && connection.db) {
      await connection.db.dropCollection('users').catch(() => {
        // Collection might not exist yet, which is fine
      });
    }
  });

  describe('create', () => {
    it('should create a new user and return a UserResponseDTO', async () => {
      // Arrange - using faker to generate test data
      const createUserDTO = generateUserDTO();

      // Act
      const result = await userRepository.create(createUserDTO);

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toEqual(createUserDTO.name);
      expect(result.email).toEqual(createUserDTO.email);
      expect(result.username).toEqual(createUserDTO.username);
      expect(result.role).toEqual(createUserDTO.role);
      expect(result.isVerified).toBe(false);
      expect(result.id).toBeDefined();
    });
  });

  describe('findByEmail', () => {
    it('should return a user when found by email', async () => {
      // Arrange - using faker for test data
      const createUserDTO = generateUserDTO();
      const createdUser = await userRepository.create(createUserDTO);
      const email = createdUser.email;

      // Act
      const result = await userRepository.findByEmail(email);

      // Assert
      expect(result).toBeDefined();
      expect(result?.email).toEqual(email);
    });

    it('should return undefined when user is not found by email', async () => {
      // Act - using faker for a random email that shouldn't exist
      const result = await userRepository.findByEmail(faker.internet.email());

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should return a user when found by id', async () => {
      // Arrange
      const createUserDTO: CreateUserDTO = {
        name: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        password: 'Secure@123',
        repeatPassword: 'Secure@123',
        role: UserRole.USER
      };

      const createdUser = await userRepository.create(createUserDTO);
      const id = createdUser.id;

      // Act
      const result = await userRepository.findById(id!);

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toEqual(id);
    });

    it('should return undefined when user is not found by id', async () => {
      // Act
      const result = await userRepository.findById('non-existent-id');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('findByEmailWithPassword', () => {
    it('should return user with password when found by email', async () => {
      // Arrange - using faker for test data
      const createUserDTO = generateUserDTO();
      const plainPassword = createUserDTO.password; // Store the plain password before it gets hashed
      const createdUser = await userRepository.create(createUserDTO);
      const email = createdUser.email;

      // Act
      const result = await userRepository.findByEmailWithPassword(email);

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBeDefined();
      expect(result?.email).toEqual(email);
      expect(result?.password).toBeDefined();
      expect(result?.role).toEqual(createUserDTO.role);
      expect(result?.isVerified).toBe(false);
    });

    it('should return undefined when user is not found by email', async () => {
      // Act - using faker for a random email that shouldn't exist
      const result = await userRepository.findByEmailWithPassword(faker.internet.email());

      // Assert
      expect(result).toBeUndefined();
    });

    it('should include all required fields in the returned object', async () => {
      // Arrange
      const createUserDTO = generateUserDTO();
      const createdUser = await userRepository.create(createUserDTO);
      const email = createdUser.email;

      // Act
      const result = await userRepository.findByEmailWithPassword(email);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('password');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('isVerified');
    });

    it('should handle user with missing isVerified field', async () => {
      // Arrange - Create a user with isVerified explicitly set to undefined
      const createUserDTO = generateUserDTO();

      // Create user model directly to bypass validation
      const userId = uuidv4();
      const userDoc = new User({
        id: userId,
        ...createUserDTO,
        isVerified: undefined
      });
      await userDoc.save();

      // Act
      const result = await userRepository.findByEmailWithPassword(createUserDTO.email);

      // Assert
      expect(result).toBeDefined();
      expect(result?.isVerified).toBe(false); // Should default to false when undefined
    });
  });

  describe('findByUsername', () => {
    it('should return a user when found by username', async () => {
      // Arrange
      const createUserDTO = generateUserDTO();
      const createdUser = await userRepository.create(createUserDTO);
      const username = createdUser.username;

      // Act
      const result = await userRepository.findByUsername(username);

      // Assert
      expect(result).toBeDefined();
      expect(result?.username).toEqual(username);
    });

    it('should return undefined when user is not found by username', async () => {
      // Act
      const result = await userRepository.findByUsername(faker.internet.username());

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      // Arrange
      const page = 1;
      const limit = 10;

      // Create multiple test users
      const users = await Promise.all([
        userRepository.create({
          name: 'Test User 1',
          email: 'test1@example.com',
          username: 'testuser1',
          password: 'Secure@123',
          repeatPassword: 'Secure@123',
          role: UserRole.USER
        }),
        userRepository.create({
          name: 'Test User 2',
          email: 'test2@example.com',
          username: 'testuser2',
          password: 'Secure@123',
          repeatPassword: 'Secure@123',
          role: UserRole.USER
        })
      ]);

      // Act
      const result = await userRepository.findAll(page, limit);

      // Assert
      expect(result).toBeDefined();
      expect(result.body).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(page);
      expect(result.last_page).toBe(1);
      expect(result.limit).toBe(limit);

      // Check that returned users match created users
      const emails = users.map(u => u.email);
      expect(result.body.every(u => emails.includes(u.email))).toBe(true);
    });

    it('should handle pagination correctly', async () => {
      // Arrange
      // Create 15 test users
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(userRepository.create({
          name: `Test User ${i}`,
          email: `test${i}@example.com`,
          username: `testuser${i}`,
          password: 'Secure@123',
          repeatPassword: 'Secure@123',
          role: UserRole.USER
        }));
      }
      await Promise.all(promises);

      // Act - get the first page with 10 items
      const result1 = await userRepository.findAll(1, 10);
      // Act - get the second page with remaining 5 items
      const result2 = await userRepository.findAll(2, 10);

      // Assert
      expect(result1.body).toHaveLength(10);
      expect(result1.total).toBe(15);
      expect(result1.page).toBe(1);
      expect(result1.last_page).toBe(2);

      expect(result2.body).toHaveLength(5);
      expect(result2.total).toBe(15);
      expect(result2.page).toBe(2);
      expect(result2.last_page).toBe(2);
    });
  });

  describe('update', () => {
    it('should update and return the updated user', async () => {
      // Arrange
      const createUserDTO: CreateUserDTO = {
        name: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        password: 'Secure@123',
        repeatPassword: 'Secure@123',
        role: UserRole.USER
      };

      const createdUser = await userRepository.create(createUserDTO);

      const updateData: UpdateUserDTO = {
        name: 'Updated Name',
        gender: Gender.MALE
      };

      // Act
      const result = await userRepository.update(createdUser.id!, updateData);

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toEqual(updateData.name);
      expect(result.gender).toEqual(updateData.gender);
      expect(result.email).toEqual(createdUser.email); // Email should remain unchanged
    });
  });

  describe('delete', () => {
    it('should delete a user successfully', async () => {
      // Arrange
      const createUserDTO: CreateUserDTO = {
        name: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        password: 'Secure@123',
        repeatPassword: 'Secure@123',
        role: UserRole.USER
      };

      const createdUser = await userRepository.create(createUserDTO);

      // Act
      await userRepository.delete(createdUser.id!);
      const deletedUser = await userRepository.findById(createdUser.id!);

      // Assert
      expect(deletedUser).toBeUndefined();
    });
  });
});
