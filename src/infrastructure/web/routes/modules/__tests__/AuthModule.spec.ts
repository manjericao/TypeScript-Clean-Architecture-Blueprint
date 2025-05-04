import request from 'supertest';
import status from 'http-status';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import express from 'express';
import { Container } from 'inversify';
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import { AuthModule } from '@infrastructure/web/routes';
import { AuthController } from '@interface/http/controllers/auth';
import { Types } from '@interface/types';
import { Gender, TokenType, UserRole } from '@enterprise/enum';
import { TokenRepositoryMongo, UserRepositoryMongo } from '@infrastructure/db/mongo/repository';
import { Token, User } from '@infrastructure/db/mongo/models';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { IJWTTokenGenerator, ITokenBlackList, ITokenGenerator } from '@application/contracts/security/authentication';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IEmailService } from '@application/contracts/communication/email';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { IAuthMiddleware } from '@infrastructure/web/middleware';

describe('AuthModule Integration Tests', () => {
  let app: express.Application;
  let mongoContainer: StartedTestContainer;
  let userRepository: UserRepositoryMongo;
  let tokenRepository: TokenRepositoryMongo;
  let container: Container;
  let mongoUri: string;
  let testUserId: string;
  let connection: mongoose.Connection;
  let passwordHasher: IPasswordHasher;
  let jwtTokenGenerator: IJWTTokenGenerator;
  let verificationToken: string;

  const mockAccessToken = 'mock.jwt.token';
  const mockRefreshToken = faker.string.alphanumeric(32);

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

    passwordHasher = {
      hashPassword: jest.fn().mockImplementation(async (password) => `hashed_${password}`),
      comparePasswords: jest.fn().mockImplementation(async (plain, hashed) =>
        hashed === `hashed_${plain}`
      ),
    };

    const mockAuthMiddleware: IAuthMiddleware = {
      initialize: jest.fn().mockImplementation(() => {
        return (req: express.Request, res: express.Response, next: express.NextFunction) => {
          next();
        };
      }),
      handle: jest.fn().mockImplementation((req: express.Request, res: express.Response, next: express.NextFunction) => {
        next();
      }),
      asMiddleware: jest.fn().mockImplementation(() => {
        return (req: express.Request, res: express.Response, next: express.NextFunction) => {
          next();
        };
      })
    };

    const mockVerificationTokenGenerator: ITokenGenerator = {
      generateToken: jest.fn().mockReturnValue('mockVerificationToken'),
      validateToken: jest.fn().mockImplementation(token => token) // Return whatever token we give it
    };

    jwtTokenGenerator = {
      generateJWTToken: jest.fn().mockImplementation(
        (_payload: any, type: TokenType) => type === TokenType.ACCESS ? mockAccessToken : mockRefreshToken
      ),
      validateJWTToken: jest.fn().mockImplementation(async () => ({
        valid: true,
        payload: {}
      }))
    };

    const mockTokenBlackList: ITokenBlackList = {
      addToBlackList: jest.fn().mockImplementation(async (token: string, expirationTime: number): Promise<void> => {
        return Promise.resolve();
      }),
      isBlackListed: jest.fn().mockImplementation(async (token: string): Promise<boolean> => {
        return Promise.resolve(false);
      })
    };

    const mockEmailService: IEmailService = {
      sendEmail: jest.fn().mockResolvedValue(true),
      verify: jest.fn().mockResolvedValue(true)
    }

    // Bind dependencies
    container.bind<IConfig>(Types.Config).toConstantValue(mockConfig);
    container.bind<ILogger>(Types.Logger).toConstantValue(mockLogger);
    container.bind(Types.UserModel).toConstantValue(User);
    container.bind(Types.TokenModel).toConstantValue(Token);
    container.bind<IUserRepository>(Types.UserRepository).to(UserRepositoryMongo);
    container.bind<ITokenRepository>(Types.TokenRepository).to(TokenRepositoryMongo);
    container.bind<IPasswordHasher>(Types.PasswordHasher).toConstantValue(passwordHasher);
    container.bind<IJWTTokenGenerator>(Types.JWTTokenGenerator).toConstantValue(jwtTokenGenerator);
    container.bind<IAuthMiddleware>(Types.AuthMiddleware).toConstantValue(mockAuthMiddleware);
    container.bind<ITokenBlackList>(Types.TokenBlackList).toConstantValue(mockTokenBlackList);
    container.bind<ITokenGenerator>(Types.VerificationTokenGenerator).toConstantValue(mockVerificationTokenGenerator);
    container.bind<IEmailService>(Types.EmailService).toConstantValue(mockEmailService);

    // Bind controller
    container.bind<AuthController>(Types.AuthController).toDynamicValue(() => {
      const userRepository = container.get<IUserRepository>(Types.UserRepository);
      const tokenRepository = container.get<ITokenRepository>(Types.TokenRepository);
      const generateToken = container.get<IJWTTokenGenerator>(Types.JWTTokenGenerator);
      const generateTokenRefresh = container.get<ITokenGenerator>(Types.VerificationTokenGenerator);
      const passwordHasher = container.get<IPasswordHasher>(Types.PasswordHasher);
      const logger = container.get<ILogger>(Types.Logger);
      const config = container.get<IConfig>(Types.Config);
      const tokenBlackList = container.get<ITokenBlackList>(Types.TokenBlackList);
      const emailService = container.get<IEmailService>(Types.EmailService);

      return new AuthController(userRepository, tokenRepository, generateToken, generateTokenRefresh, passwordHasher, logger, config, tokenBlackList, emailService);
    }).inSingletonScope();

    container.bind<AuthModule>(Types.AuthModule).to(AuthModule);

    // Initialize app
    app = express();
    app.use(express.json());
    app.use('/auth', container.get<AuthModule>(Types.AuthModule).router);

    // Initialize repositories
    userRepository = container.get<UserRepositoryMongo>(Types.UserRepository);
    tokenRepository = container.get<TokenRepositoryMongo>(Types.TokenRepository);
  });

  beforeEach(async () => {
    // Create a test user
    const testUser = {
      name: faker.person.firstName(),
      email: faker.internet.email(),
      username: faker.internet.username(),
      password: `hashed_${faker.internet.password({ length: 10 })}`,
      repeatPassword: `hashed_${faker.internet.password({ length: 10 })}`,
      role: UserRole.USER,
      isVerified: false,
      birthDate: faker.date.past(),
      gender: Gender.MALE
    };

    const createdUser = await userRepository.create(testUser);
    testUserId = createdUser.id;

    // Create a verification token
    verificationToken = 'mockVerificationToken';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    await tokenRepository.create({
      token: verificationToken,
      userId: testUserId,
      type: TokenType.VERIFICATION,
      expiresAt: expiresAt,
      isRevoked: false
    });
  });

  afterEach(async () => {
    await connection.dropDatabase();
  });

  afterAll(async () => {
    await connection.close();
    await mongoContainer.stop();
  });

  describe('GET /auth/verify-email', () => {
    it('should verify user email successfully', async () => {
      // Instead of using query parameters, try using URLEncoded parameters
      const response = await request(app)
        .get('/auth/verify-email')
        .query({ token: verificationToken });

      // If the test still fails, expect 200 anyway to see the full response
      expect(response.status).toBe(status.OK);
      expect(response.body.data).toHaveProperty('message', 'Email verified successfully');
      expect(response.body.data).toHaveProperty('userId', testUserId);

      const user = await userRepository.findById(testUserId);
      expect(user?.isVerified).toBe(true);
    });

    it('should return 400 when token is not provided', async () => {
      const response = await request(app)
        .get('/auth/verify-email')
        .expect(status.BAD_REQUEST);

      expect(response.body).toHaveProperty('message', 'Validation failed');
    });

    it('should return 404 when token is not found', async () => {
      const response = await request(app)
        .get('/auth/verify-email?token=nonexistenttoken')
        .expect(status.NOT_FOUND);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Mark the user's email as verified
      await userRepository.update(testUserId, { isVerified: true });
    });

    it('should login successfully with valid credentials', async () => {
      const plainPassword = faker.internet.password({ length: 10 });

      // Update user with a known password
      await userRepository.update(testUserId, {
        password: `hashed_${plainPassword}`
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: (await userRepository.findById(testUserId))?.email,
          password: plainPassword
        })
        .expect(status.OK);

      expect(response.body.data).toHaveProperty('tokens');
      expect(response.body.data).toHaveProperty('userId', testUserId);
      expect(response.body).toEqual({
        data: {
          userId: expect.any(String),
          tokens: {
            access: {
              token: mockAccessToken,
              expires: expect.any(String)
            },
            refresh: {
              token: mockRefreshToken,
              expires: expect.any(String)
            }
          },
        }
      });
    });

    it('should return 401 with invalid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: (await userRepository.findById(testUserId))?.email,
          password: 'wrongpassword'
        })
        .expect(status.UNAUTHORIZED);

      expect(response.body).toHaveProperty('message');
    });

    it('should return 403 when email is not verified', async () => {
      // First mark the email as not verified
      await userRepository.update(testUserId, { isVerified: false });

      const plainPassword = faker.internet.password({ length: 10 });

      // Update user with a known password
      await userRepository.update(testUserId, {
        password: `hashed_${plainPassword}`
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: (await userRepository.findById(testUserId))?.email,
          password: plainPassword
        })
        .expect(status.FORBIDDEN);

      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 when user is not found', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        })
        .expect(status.NOT_FOUND);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/logout', () => {
    beforeEach(async () => {
      // Create a test user
      const testUser = await new User({
        id: faker.string.uuid(),
        email: faker.internet.email(),
        username: faker.internet.username(),
        name: faker.person.fullName(),
        password: await passwordHasher.hashPassword('password123'),
        role: UserRole.USER,
        gender: Gender.MALE,
        isVerified: true
      }).save();

      testUserId = (testUser._id as mongoose.Types.ObjectId).toString();

      // Create a refresh token in a database
      await new Token({
        id: faker.string.uuid(),
        token: mockRefreshToken,
        userId: testUserId,
        type: TokenType.REFRESH,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false
      }).save();
    });

    afterEach(async () => {
      await User.deleteMany({});
      await Token.deleteMany({});
    });

    it('should successfully logout user and blacklist tokens', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${mockAccessToken}`)
        .send({
          refreshToken: mockRefreshToken
        });

      expect(response.status).toBe(status.NO_CONTENT);
    });

    it('should return 400 if tokens are not provided', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${mockAccessToken}`)
        .send({});

      expect(response.status).toBe(status.BAD_REQUEST);
    });

    it('should return 400 if only one token is provided', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${mockAccessToken}`)
        .send({
          accessToken: mockAccessToken
        });

      expect(response.status).toBe(status.BAD_REQUEST);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should send a forgot-password email when a valid email is provided', async () => {
      const testUserForgotPass = {
        name: faker.person.firstName(),
        email: faker.internet.email(),
        username: faker.internet.username(),
        password: `hashed_${faker.internet.password({ length: 10 })}`,
        repeatPassword: `hashed_${faker.internet.password({ length: 10 })}`,
        role: UserRole.USER,
        isVerified: true,
        birthDate: faker.date.past(),
        gender: Gender.MALE
      };

      const createdUserForgotPass = await userRepository.create(testUserForgotPass);

      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: createdUserForgotPass.email });

      expect(response.status).toBe(status.OK);
      expect(response.body.data.message).toBeDefined(); // e.g., 'Email sent successfully.'
    });

    it('should return 404 when the email does not exist', async () => {
      const invalidEmail = 'nonexistent@example.com';

      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: invalidEmail });

      expect(response.status).toBe(status.NOT_FOUND);
      expect(response.body.message).toBeDefined(); // e.g., 'User not found'
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reset password successfully', async () => {
      // 1. Create a specific RESET_PASSWORD token for this test
      const resetPasswordTokenValue = 'mockResetPasswordToken';
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10-minute validity

      await tokenRepository.create({
        token: resetPasswordTokenValue,
        userId: testUserId, // Use the testUserId created in beforeEach
        type: TokenType.RESET_PASSWORD, // <-- Correct type
        expiresAt: expiresAt,
        isRevoked: false
      });

      // 2. Make the request using this token
      const newPassword = 'newSecurePassword123';
      const response = await request(app)
        .post('/auth/reset-password') // Assuming this is the endpoint
        .send({
          token: resetPasswordTokenValue,
          newPassword: newPassword
        });

      // 3. Assert the expected outcome (200 OK)
      expect(response.status).toBe(status.OK); // Or status.NO_CONTENT depending on your success handler
      expect(response.body.data).toHaveProperty('message', 'Password has been reset successfully.');
    });

    it('should return 404 when the provided reset token is not found\n', async () => {
      const invalidToken = 'invalidToken';
      const newPassword = 'newSecurePassword123';

      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: invalidToken, newPassword });

      expect(response.status).toBe(status.NOT_FOUND);
      expect(response.body.message).toBeDefined(); // e.g., 'Invalid or expired token.'
    });
  });

  describe('/send-verification-email', () => {
    it('should send a verification email to an existing user', async () => {
      // Create a test user who needs email verification
      const testUser = await userRepository.create({
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: await passwordHasher.hashPassword('Test123!'),
        repeatPassword: await passwordHasher.hashPassword('Test123!'),
        username: faker.internet.username(),
        gender: Gender.MALE,
        role: UserRole.USER
      });

      // Create a verification token for the user
      await tokenRepository.create({
        token: 'mockVerificationToken',
        userId: testUser.id,
        type: TokenType.VERIFICATION,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isRevoked: false
      });

      const response = await request(app)
        .post('/auth/send-verification-email')
        .set('Content-Type', 'application/json')
        .send({ email: testUser.email })
        .expect(status.OK);

      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data.message).toEqual('Verification email sent successfully');
    });

    it('should return 404 if user does not exist', async () => {
      const nonExistentEmail = faker.internet.email();

      await request(app)
        .post('/auth/send-verification-email')
        .send({ email: nonExistentEmail })
        .expect(status.NOT_FOUND);
    });

    it('should return 200 if user email is already verified', async () => {
      // Create a test user with email already verified
      const user = await userRepository.create({
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: await passwordHasher.hashPassword('Test123!'),
        repeatPassword: await passwordHasher.hashPassword('Test123!'),
        username: faker.internet.username(),
        gender: Gender.FEMALE,
        role: UserRole.USER
      });

      const verifiedUser = await userRepository.update(user.id, { isVerified: true });

      await tokenRepository.create({
        token: 'mockVerificationToken',
        userId: verifiedUser.id,
        type: TokenType.VERIFICATION,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        isRevoked: false
      });

      await request(app)
        .post('/auth/send-verification-email')
        .send({ email: verifiedUser.email })
        .expect(status.OK);
    });

    it('should create a verification token for the user', async () => {
      // Create a test user who needs email verification
      const testUser = await userRepository.create({
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: await passwordHasher.hashPassword('Test123!'),
        repeatPassword: await passwordHasher.hashPassword('Test123!'),
        username: faker.internet.username(),
        gender: Gender.MALE,
        role: UserRole.USER
      });

      verificationToken = 'test-verification-token';
      await tokenRepository.create({
        token: verificationToken,
        userId: testUser.id,
        type: TokenType.VERIFICATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isRevoked: false
      });

      await request(app)
        .post('/auth/send-verification-email')
        .send({ email: testUser.email })
        .expect(status.OK);

      const token = await tokenRepository.findByUserId(testUser.id);

      expect(token).toBeDefined();
      expect(token[0]?.userId.toString()).toEqual(testUser.id);
      expect(token[0]?.type).toEqual(TokenType.VERIFICATION);
    });

    it('should return 400 if email is not provided', async () => {
      await request(app)
        .post('/auth/send-verification-email')
        .send({})
        .expect(status.BAD_REQUEST);
    });

    it('should return 400 if email format is invalid', async () => {
      await request(app)
        .post('/auth/send-verification-email')
        .send({ email: 'invalid-email' })
        .expect(status.BAD_REQUEST);
    });
  });
});
