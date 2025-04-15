import { LoginUser } from '@application/use_cases/auth';
import { AuthenticateUserDTO } from '@enterprise/dto/input/auth';
import { TokenType, UserRole } from '@enterprise/enum';
import { v4 as uuidv4 } from 'uuid';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { IJWTTokenGenerator } from '@application/contracts/security/authentication';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IUserRepository } from '@application/contracts/domain/repositories';

describe('LoginUser', () => {
  // Mock dependencies
  const mockUserRepository: jest.Mocked<IUserRepository> = {
    findByEmailWithPassword: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    findByEmail: jest.fn(),
    delete: jest.fn(),
    findAll: jest.fn(),
  } as unknown as jest.Mocked<IUserRepository>;

  const mockPasswordHasher: jest.Mocked<IPasswordHasher> = {
    hashPassword: jest.fn(),
    comparePasswords: jest.fn(),
  } as unknown as jest.Mocked<IPasswordHasher>;

  const mockTokenGenerator: jest.Mocked<IJWTTokenGenerator> = {
    generateJWTToken: jest.fn(),
    validateJWTToken: jest.fn(),
  } as unknown as jest.Mocked<IJWTTokenGenerator>;

  const mockConfig: jest.Mocked<IConfig> = {
    jwt: {
      accessExpirationMinutes: 60,
      refreshExpirationDays: 30,
      secret: 'test-secret',
    },
  } as unknown as jest.Mocked<IConfig>;

  const mockLogger: jest.Mocked<ILogger> = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<ILogger>;

  let loginUser: LoginUser;
  let mockEmitSpy: jest.SpyInstance;

  // Test data
  const userId = uuidv4();
  const testEmail = 'test@example.com';
  const testPassword = 'Password123!';
  const accessToken = 'test-access-token';

  const credentials: AuthenticateUserDTO = {
    email: testEmail,
    password: testPassword,
  };

  const mockUserWithPassword = {
    id: userId,
    email: testEmail,
    password: 'hashed-password',
    role: UserRole.USER,
    isVerified: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    loginUser = new LoginUser(
      mockUserRepository,
      mockPasswordHasher,
      mockTokenGenerator,
      mockConfig,
      mockLogger
    );
    mockEmitSpy = jest.spyOn(loginUser as any, 'emitOutput');
  });

  describe('execute', () => {
    it('should successfully login a user with valid credentials', async () => {
      // Arrange
      mockUserRepository.findByEmailWithPassword.mockResolvedValue(mockUserWithPassword);
      mockPasswordHasher.comparePasswords.mockResolvedValue(true);
      mockTokenGenerator.generateJWTToken.mockReturnValue(accessToken);

      // Set up event handler
      const successHandler = jest.fn();
      loginUser.on('SUCCESS', successHandler);

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledWith(testEmail);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledWith(
        testPassword,
        mockUserWithPassword.password
      );
      expect(mockTokenGenerator.generateJWTToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserWithPassword.id,
          email: mockUserWithPassword.email,
          role: mockUserWithPassword.role,
        }),
        TokenType.ACCESS,
        mockConfig.jwt.accessExpirationMinutes
      );

      expect(mockEmitSpy).toHaveBeenCalledWith('SUCCESS', {
        userId: mockUserWithPassword.id,
        accessTokenExpires: expect.any(Date),
        accessToken: accessToken,
        refreshToken: accessToken,
        refreshTokenExpires: expect.any(Date),
      });

      expect(successHandler).toHaveBeenCalledWith({
        userId: mockUserWithPassword.id,
        accessToken: accessToken,
        accessTokenExpires: expect.any(Date),
        refreshToken: accessToken,
        refreshTokenExpires: expect.any(Date)
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Attempting user login', { email: testEmail });
    });

    it('should emit USER_NOT_FOUND when user does not exist', async () => {
      // Arrange
      mockUserRepository.findByEmailWithPassword.mockResolvedValue(undefined);

      // Set up event handler
      const notFoundHandler = jest.fn();
      loginUser.on('USER_NOT_FOUND', notFoundHandler);

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledWith(testEmail);
      expect(mockPasswordHasher.comparePasswords).not.toHaveBeenCalled();
      expect(mockTokenGenerator.generateJWTToken).not.toHaveBeenCalled();

      expect(mockEmitSpy).toHaveBeenCalledWith(
        'USER_NOT_FOUND',
        `No user found with email ${testEmail}`
      );
      expect(notFoundHandler).toHaveBeenCalledWith(`No user found with email ${testEmail}`);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Login attempt for non-existent user',
        { email: testEmail }
      );
    });

    it('should emit INVALID_CREDENTIALS when password is incorrect', async () => {
      // Arrange
      mockUserRepository.findByEmailWithPassword.mockResolvedValue(mockUserWithPassword);
      mockPasswordHasher.comparePasswords.mockResolvedValue(false);

      // Set up event handler
      const invalidCredentialsHandler = jest.fn();
      loginUser.on('INVALID_CREDENTIALS', invalidCredentialsHandler);

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledWith(testEmail);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledWith(
        testPassword,
        mockUserWithPassword.password
      );
      expect(mockTokenGenerator.generateJWTToken).not.toHaveBeenCalled();

      expect(mockEmitSpy).toHaveBeenCalledWith('INVALID_CREDENTIALS', 'Invalid email or password');
      expect(invalidCredentialsHandler).toHaveBeenCalledWith('Invalid email or password');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid password attempt',
        { email: testEmail }
      );
    });

    it('should emit ACCOUNT_NOT_VERIFIED when user account is not verified', async () => {
      // Arrange
      mockUserRepository.findByEmailWithPassword.mockResolvedValue({
        ...mockUserWithPassword,
        isVerified: false,
      });
      mockPasswordHasher.comparePasswords.mockResolvedValue(true);

      // Set up event handler
      const notVerifiedHandler = jest.fn();
      loginUser.on('ACCOUNT_NOT_VERIFIED', notVerifiedHandler);

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledWith(testEmail);
      expect(mockPasswordHasher.comparePasswords).toHaveBeenCalledWith(
        testPassword,
        mockUserWithPassword.password
      );
      expect(mockTokenGenerator.generateJWTToken).not.toHaveBeenCalled();

      expect(mockEmitSpy).toHaveBeenCalledWith(
        'ACCOUNT_NOT_VERIFIED',
        'Please verify your email before logging in'
      );
      expect(notVerifiedHandler).toHaveBeenCalledWith('Please verify your email before logging in');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Login attempt on unverified account',
        { email: testEmail }
      );
    });

    it('should emit ERROR when an unexpected error occurs', async () => {
      // Arrange
      const testError = new Error('Test error');
      mockUserRepository.findByEmailWithPassword.mockRejectedValue(testError);

      // Set up event handler
      const errorHandler = jest.fn();
      loginUser.on('ERROR', errorHandler);

      // Act
      await loginUser.execute(credentials);

      // Assert
      expect(mockUserRepository.findByEmailWithPassword).toHaveBeenCalledWith(testEmail);
      expect(mockEmitSpy).toHaveBeenCalledWith('ERROR', testError);
      expect(errorHandler).toHaveBeenCalledWith(testError);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
