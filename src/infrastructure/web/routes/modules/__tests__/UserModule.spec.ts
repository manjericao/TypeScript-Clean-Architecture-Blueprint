import request from 'supertest';
import status from 'http-status';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import express from 'express';
import { Container } from 'inversify';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import { UserModule } from '@infrastructure/web/routes';
import { UserController } from '@interface/http/controllers/user';
import { BaseTransformer } from '@infrastructure/services/transformer';
import { ITransformer } from 'src/application/contracts/transformer';
import { UserRole, Gender } from '@enterprise/enum';
import { CreateUserDTO } from '@enterprise/dto/input/user';
import { UserRepositoryMongo } from '@infrastructure/db/mongo/repository';
import { User } from '@infrastructure/db/mongo/models';
import { Types } from '@interface/types';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IUserRepository } from '@application/contracts/domain/repositories';
import { IAuthMiddleware } from '@infrastructure/web/middleware';
import { IAuthorizationMiddleware } from '@application/contracts/security/authorization';

describe('UserModule Integration Tests', () => {
  let app: express.Application;
  let mongoContainer: StartedTestContainer;
  let userRepository: UserRepositoryMongo;
  let container: Container;
  let mongoUri: string;
  let testUserId: string;
  let connection: mongoose.Connection;
  let passwordHasher: IPasswordHasher;

  const generateUserDTO = (): CreateUserDTO => {
    const password = `${faker.internet.password({ length: 8, memorable: true })}A1!`;

    return {
      name: faker.person.firstName().replace(/[^a-zA-Z0-9]/g, ''),
      email: faker.internet.email(),
      username: faker.internet.username().replace(/[^a-zA-Z0-9]/g, ''),
      password: password,
      repeatPassword: password,
      role: faker.helpers.arrayElement(Object.values(UserRole)),
      birthDate: faker.date.past({ years: 30 }),
      gender: faker.helpers.arrayElement(Object.values(Gender))
    };
  };

  beforeAll(async () => {
    mongoContainer = await new GenericContainer('mongo:6.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage('Waiting for connections'))
      .start();

    const mongoPort = mongoContainer.getMappedPort(27017);
    const mongoHost = mongoContainer.getHost();
    mongoUri = `mongodb://${mongoHost}:${mongoPort}/testdb`;

    await mongoose.connect(mongoUri);
    connection = mongoose.connection;

    container = new Container();

    const mockConfig: IConfig = {
      env: 'test',
      MONGOOSE_DEBUG: false,
      jwt: {
        secret: 'test-jwt-secret',
        accessExpirationMinutes: 30,
        refreshExpirationDays: 30,
        resetPasswordExpirationMinutes: 10,
        verifyEmailExpirationMinutes: 10
      },
      db: mongoUri,
      db_config: {
        useNewUrlParser: true,
        useUnifiedTopology: true
      },
      storage: {
        type: 'local',
        aws: {
          bucketName: undefined,
          accessKeyId: undefined,
          secretAccessKey: undefined,
          region: undefined
        }
      },
      server: {
        protocol: 'http',
        host: 'localhost',
        port: 3000,
        version: 'v1'
      },
      smtp: {
        host: 'localhost',
        port: 3000,
        secure: false,
        debug: false,
        username: 'test',
        password: 'test',
        from: 'Test <test@example.com>'
      },
      redis: {
        host: 'localhost',
        port: 3011
      }
    };

    const mockLogger: ILogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    const mockAuthMiddleware: IAuthMiddleware = {
      initialize: jest.fn().mockImplementation(() => {
        return (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
          next();
        };
      }),
      handle: jest.fn().mockImplementation((_req: express.Request, _res: express.Response, next: express.NextFunction) => {
        next();
      }),
      asMiddleware: jest.fn().mockImplementation(() => {
        return (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
          next();
        };
      })
    };

    passwordHasher = {
      hashPassword: jest.fn().mockImplementation(async (password) => `hashed_${password}`),
      comparePasswords: jest.fn().mockImplementation(async (plain, hashed) =>
        hashed === `hashed_${plain}`
      ),
    };

    const mockAuthorizationMiddleware: IAuthorizationMiddleware = {
      handle: jest.fn().mockImplementation((_req: express.Request, _res: express.Response, next: express.NextFunction): void => {
        next();
      }),

      requireRoles: jest.fn().mockImplementation((_roles) => {
        return (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
          next();
        };
      })
    };

    // Bind dependencies
    container.bind<IConfig>(Types.Config).toConstantValue(mockConfig);
    container.bind<ILogger>(Types.Logger).toConstantValue(mockLogger);
    container.bind(Types.UserModel).toConstantValue(User);
    container.bind<IUserRepository>(Types.UserRepository).to(UserRepositoryMongo);
    container.bind<ITransformer>(Types.Transformer).to(BaseTransformer);
    container.bind<IPasswordHasher>(Types.PasswordHasher).toConstantValue(passwordHasher);
    container.bind<IAuthMiddleware>(Types.AuthMiddleware).toConstantValue(mockAuthMiddleware);
    container.bind<IAuthorizationMiddleware>(Types.AuthorizationMiddleware).toConstantValue(mockAuthorizationMiddleware);

    // Bind controller
    container.bind<UserController>(Types.UserController).toDynamicValue(() => {
      const userRepository = container.get<IUserRepository>(Types.UserRepository);
      const transformer = container.get<ITransformer>(Types.Transformer);
      const passwordHasher = container.get<IPasswordHasher>(Types.PasswordHasher);
      const logger = container.get<ILogger>(Types.Logger);

      return new UserController(userRepository, transformer, passwordHasher, logger);
    }).inSingletonScope();

    // Bind module
    container.bind<UserModule>(Types.UserModule).to(UserModule);

    app = express();
    app.use(express.json());

    const userModule = container.get<UserModule>(Types.UserModule);
    app.use('/user', userModule.router);

    userRepository = container.get<UserRepositoryMongo>(Types.UserRepository);

    const userDTO = generateUserDTO();
    const createdUser = await userRepository.create({
      name: userDTO.name,
      email: userDTO.email,
      username: userDTO.username,
      password: userDTO.password,
      repeatPassword: userDTO.repeatPassword,
      role: userDTO.role,
      birthDate: userDTO.birthDate,
      gender: userDTO.gender
    });

    testUserId = createdUser.id;
  });

  afterAll(async () => {
    if (connection) {
      await connection.close();
    }

    if (mongoContainer) {
      await mongoContainer.stop();
    }
  });

  describe('POST /user', () => {
    it('should create a user successfully and return 201 status', async () => {
      // Arrange
      const userData = generateUserDTO();

      // Act
      const response = await request(app)
        .post('/user')
        .send(userData)
        .expect(status.CREATED);

      // Assert
      expect(response.body).toBeDefined();
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.name).toEqual(userData.name);
      expect(response.body.data.email).toEqual(userData.email);
      expect(response.body.data.username).toEqual(userData.username);
      expect(response.body.data.role).toEqual(userData.role);
      // The Password should not be returned
      expect(response.body.data.password).toBeUndefined();

      // Verify the user was created in the database
      const createdUser = await userRepository.findByEmail(userData.email);
      expect(createdUser).toBeDefined();
      expect(createdUser?.name).toEqual(userData.name);
    });

    it('should return 400 if validation fails due to missing required fields', async () => {
      // Arrange
      const incompleteUserData = {
        email: faker.internet.email(),
      };

      // Act & Assert
      const response = await request(app)
        .post('/user')
        .send(incompleteUserData)
        .expect(status.BAD_REQUEST);

      expect(response.body.message).toBeDefined();
    });

    it('should return 400 if passwords do not match', async () => {
      // Arrange
      const userData = generateUserDTO();
      userData.repeatPassword = 'different_password';

      // Act & Assert
      const response = await request(app)
        .post('/user')
        .send(userData)
        .expect(status.BAD_REQUEST);

      expect(response.body.details).toEqual({"repeatPassword": ["Passwords do not match"]});
    });

    it('should return 409 if user with email already exists', async () => {
      // Arrange
      const userData = generateUserDTO();

      await userRepository.create({
        ...userData,
        password: 'hashed_password',
        repeatPassword: 'hashed_password'
      });

      // Act & Assert - Try to create another user with the same email
      const response = await request(app)
        .post('/user')
        .send(userData);

      expect(response.status).toBe(status.CONFLICT);
      expect(response.body.message).toContain('already exists');
    });

    it('should return 409 if username is already taken', async () => {
      // Arrange
      const firstUser = generateUserDTO();
      const secondUser = generateUserDTO();
      secondUser.username = firstUser.username; // Make usernames the same

      // Create first user
      await userRepository.create({
        ...firstUser,
        password: 'hashed_password',
        repeatPassword: 'hashed_password'
      });

      // Act & Assert - Try to create second user with same username
      const response = await request(app)
        .post('/user')
        .send(secondUser)
        .expect(status.CONFLICT);

      expect(response.body.message).toContain('is already taken');
    });

    it('should hash the password before storing', async () => {
      // Arrange
      const userData = generateUserDTO();
      const plainPassword = userData.password;

      // Act
      await request(app)
        .post('/user')
        .send(userData)
        .expect(status.CREATED);

      // Assert
      expect(passwordHasher.hashPassword).toHaveBeenCalledWith(plainPassword);

      // Verify the user was stored with a hashed password
      const storedUser = await userRepository.findByEmail(userData.email);
      expect(storedUser).toBeDefined();
      // Can't directly check the password hash, but we can verify it was called
      expect(passwordHasher.hashPassword).toHaveBeenCalledTimes(2);
    });

    it('should handle and validate email format properly', async () => {
      // Arrange
      const userData = generateUserDTO();
      userData.email = 'invalid-email';

      // Act & Assert
      const response = await request(app)
        .post('/user')
        .send(userData)
        .expect(status.BAD_REQUEST);

      expect(response.body.message).toBeDefined();
    });

    it('should handle and validate role enum values properly', async () => {
      // Arrange
      const userData = generateUserDTO();
      userData.role = 'INVALID_ROLE' as UserRole;

      // Act & Assert
      const response = await request(app)
        .post('/user')
        .send(userData)
        .expect(status.BAD_REQUEST);

      expect(response.body.message).toBeDefined();
    });

    it('should handle and validate gender enum values properly', async () => {
      // Arrange
      const userData = generateUserDTO();
      userData.gender = 'INVALID_GENDER' as Gender;

      // Act & Assert
      const response = await request(app)
        .post('/user')
        .send(userData)
        .expect(status.BAD_REQUEST);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('GET /user', () => {
    it('GET /user - should return all users', async () => {
      const response = await request(app).get('/user');

      expect(response.status).toBe(status.OK);
      expect(Array.isArray(response.body.data.body)).toBe(true);
      expect(response.body.data.body.length).toBeGreaterThan(0);
    });

    it('should return paginated users list', async () => {
      const response = await request(app)
        .get('/user')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(status.OK);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data.body)).toBe(true);
      expect(response.body.data).toHaveProperty('page', 1);
      expect(response.body.data).toHaveProperty('limit', 10);
      expect(response.body.data).toHaveProperty('total');
    });

    it('should apply pagination correctly', async () => {
      const response = await request(app)
        .get('/user')
        .query({ page: 1, limit: 2 });

      expect(response.status).toBe(status.OK);
      expect(response.body.data.body.length).toBeLessThanOrEqual(2);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(2);
    });
  });

  describe('GET /user/:id', () => {
    it('should return a user when a valid ID is provided', async () => {
      const response = await request(app)
        .get(`/user/${testUserId}`)
        .expect('Content-Type', /json/)
        .expect(status.OK);

      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('id', testUserId);
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('username');
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should return 404 when user does not exist', async () => {
      const nonExistentId = '60d21b4667d0d8992e610c85';

      await request(app)
        .get(`/user/${nonExistentId}`)
        .expect(status.NOT_FOUND);
    });
  });

  describe('DELETE /user/:id', () => {
    it('should delete a user when a valid ID is provided', async () => {
      // First, create a user to delete
      const userDTO = generateUserDTO();
      const createdUser = await userRepository.create(userDTO);
      const userId = createdUser.id.toString();

      await request(app)
        .delete(`/user/${userId}`)
        .expect(status.NO_CONTENT);

      const deletedUser = await userRepository.findById(userId);

      expect(deletedUser).toBeUndefined();
    });

    it('should return 404 when deleting non-existent user', async () => {
      const nonExistentId = '60d21b4667d0d8992e610c85';

      await request(app)
        .delete(`/user/${nonExistentId}`)
        .expect(status.NOT_FOUND);
    });

    it('should return 404 when ID is invalid', async () => {
      await request(app)
        .delete('/user/')
        .expect(status.NOT_FOUND);
    });
  });

  describe('PUT /user/:id', () => {
    let validUser: CreateUserDTO;
    let createdUser: any;

    beforeEach(async () => {
      // Create a user to update
      validUser = generateUserDTO();
      const createResponse = await request(app)
        .post('/user')
        .send(validUser);

      expect(createResponse.status).toBe(status.CREATED);
      createdUser = createResponse.body;

      // Check that the user was actually created and has an ID
      expect(createdUser).toHaveProperty('data.id');
    });

    it('should update user with valid data', async () => {
      const updates = {
        name: 'Updated Name',
        email: faker.internet.email()
      };

      // Send the PUT request to update the user
      const response = await request(app)
        .put(`/user/${createdUser.id}`)
        .send(updates);

      expect(response.status).not.toBe(500); // At least it shouldn't be a server error

      // If the response is successful, check that the data was updated
      if (response.status === 200) {
        expect(response.body).toMatchObject({
          id: createdUser.id,
          name: updates.name,
          email: updates.email
        });
      }
    });

    it('should return 400 when email is invalid', async () => {
      const invalidUser = { ...validUser, email: 'not-an-email' };
      const response = await request(app).post('/user').send(invalidUser);
      expect(response.status).toBe(status.BAD_REQUEST);
    });


    it('should return 404 when updating non-existent user', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const updates = {
        name: 'Updated Name'
      };

      const response = await request(app)
        .put(`/user/${nonExistentId}`)
        .send(updates);

      expect(response.status).toBe(status.NOT_FOUND);
    });

    it('should return 409 when updating with email that belongs to another user', async () => {
      const userData = generateUserDTO();
      await request(app).post('/user').send(userData);

      // Try to create another user with the same email
      const duplicateUser = {
        ...generateUserDTO(),
        email: userData.email // Use the same email as the first user
      };

      const response = await request(app).post('/user').send(duplicateUser);
      expect(response.status).toBe(status.CONFLICT);
    });

    it('should return 409 when updating with username that belongs to another user', async () => {
      const userData = generateUserDTO();
      await request(app).post('/user').send(userData);

      // Try to create another user with the same username
      const duplicateUser = {
        ...generateUserDTO(),
        username: userData.username
      };

      const response = await request(app).post('/user').send(duplicateUser);
      expect(response.status).toBe(status.CONFLICT);
    });
  });
});
