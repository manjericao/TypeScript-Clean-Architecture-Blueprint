import { faker } from '@faker-js/faker';
import { ForgotPassword } from '@application/use_cases/auth';
import { EmailUserDTO } from '@enterprise/dto/input/auth';
import { TokenType } from '@enterprise/enum';
import { UserRole } from '@enterprise/enum';
import { ITokenGenerator } from '@application/contracts/security/authentication';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

describe('ForgotPassword', () => {
  // Mock dependencies
  const mockUserRepository: jest.Mocked<IUserRepository> = {
    findByEmail: jest.fn(),
  } as unknown as jest.Mocked<IUserRepository>;

  const mockTokenRepository: jest.Mocked<ITokenRepository> = {
    create: jest.fn(),
  } as unknown as jest.Mocked<ITokenRepository>;

  const mockGenerateToken: jest.Mocked<ITokenGenerator> = {
    generateToken: jest.fn(),
  } as unknown as jest.Mocked<ITokenGenerator>;

  const mockConfig: jest.Mocked<IConfig> = {
    env: 'test',
    MONGOOSE_DEBUG: false,
    jwt: {
      secret: faker.string.alphanumeric(32),
      accessExpirationMinutes: 15,
      refreshExpirationDays: 7,
      resetPasswordExpirationMinutes: 10,
      verifyEmailExpirationMinutes: 15,
    },
    db: faker.internet.url(),
    db_config: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
    storage: {
      type: 'local',
      aws: {
        bucketName: undefined,
        accessKeyId: undefined,
        secretAccessKey: undefined,
        region: undefined,
      },
    },
    server: {
      protocol: 'http',
      host: 'localhost',
      port: 3000,
      version: '1.0.0',
    },
  } as jest.Mocked<IConfig>;

  const mockLogger: jest.Mocked<ILogger> = {
    info: jest.fn(),
    error: jest.fn(),
  } as unknown as jest.Mocked<ILogger>;

  let forgotPassword: ForgotPassword;
  let mockEmitSpy: jest.SpyInstance;

  // Test data generation using Faker
  const generateTestData = () => {
    const email = faker.internet.email();
    const resetToken = faker.string.uuid();
    const userId = faker.string.uuid();

    const verifiedUser = {
      id: userId,
      name: faker.person.fullName(),
      email,
      username: faker.internet.username(),
      role: UserRole.USER,
      isVerified: true,
    };

    const unverifiedUser = {
      ...verifiedUser,
      isVerified: false,
    };

    const forgotPasswordDTO: EmailUserDTO = {
      email,
    };

    return {
      email,
      resetToken,
      userId,
      verifiedUser,
      unverifiedUser,
      forgotPasswordDTO,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    forgotPassword = new ForgotPassword(
      mockUserRepository,
      mockTokenRepository,
      mockGenerateToken,
      mockConfig,
      mockLogger
    );
    mockEmitSpy = jest.spyOn(forgotPassword as any, 'emitOutput');
  });

  describe('execute', () => {
    it('should successfully initiate password reset for verified user', async () => {
      // Arrange
      const {
        email,
        resetToken,
        userId,
        verifiedUser,
        forgotPasswordDTO
      } = generateTestData();

      // Modify mockConfig to include any specific configuration needed
      mockConfig.server.host = 'http://example.com';

      // Rest of the test remains the same
      mockUserRepository.findByEmail.mockResolvedValue(verifiedUser);
      mockGenerateToken.generateToken.mockReturnValue(resetToken);
      mockTokenRepository.create.mockResolvedValue({
        id: faker.string.uuid(),
        token: resetToken,
        userId,
        type: TokenType.RESET_PASSWORD,
        expiresAt: new Date(Date.now() + 3600000),
        isRevoked: false,
        isExpired: () => false,
        isValid: () => true
      });


      // Set up event handler
      const successHandler = jest.fn();
      forgotPassword.on('SUCCESS', successHandler);

      // Act
      await forgotPassword.execute(forgotPasswordDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(email);
      expect(mockGenerateToken.generateToken).toHaveBeenCalled();
      expect(mockTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: resetToken,
          userId,
          type: TokenType.RESET_PASSWORD,
        })
      );
      expect(mockEmitSpy).toHaveBeenCalledWith('SUCCESS', {
        message: 'Password reset link sent to your email'
      });
      expect(successHandler).toHaveBeenCalledWith({
        message: 'Password reset link sent to your email'
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing forgot password request',
        { email }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Password reset token generated',
        { userId }
      );
    });

    it('should emit USER_NOT_FOUND when user does not exist', async () => {
      // Arrange
      const { email, forgotPasswordDTO } = generateTestData();

      mockUserRepository.findByEmail.mockResolvedValue(undefined);

      // Act
      await forgotPassword.execute(forgotPasswordDTO);

      // Assert
      expect(mockEmitSpy).toHaveBeenCalledWith(
        'USER_NOT_FOUND',
        'No user found with email ' + email
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Forgot password attempt for non-existent user',
        { email }
      );
    });

    it('should emit ACCOUNT_NOT_VERIFIED for unverified user', async () => {
      // Arrange
      const {
        email,
        unverifiedUser,
        forgotPasswordDTO
      } = generateTestData();

      mockUserRepository.findByEmail.mockResolvedValue(unverifiedUser);

      // Act
      await forgotPassword.execute(forgotPasswordDTO);

      // Assert
      expect(mockEmitSpy).toHaveBeenCalledWith(
        'ACCOUNT_NOT_VERIFIED',
        'Please verify your email before resetting password'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Forgot password attempt on unverified account',
        expect.objectContaining({
          email
        })
      );
    });

    it('should handle unexpected errors', async () => {
      // Arrange
      const { email, verifiedUser, forgotPasswordDTO } = generateTestData();
      const unexpectedError = new Error('Unexpected error');

      mockUserRepository.findByEmail.mockResolvedValue(verifiedUser);
      mockGenerateToken.generateToken.mockImplementation(() => {
        throw unexpectedError;
      });

      // Act
      await forgotPassword.execute(forgotPasswordDTO);

      // Assert
      expect(mockEmitSpy).toHaveBeenCalledWith('ERROR', unexpectedError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in forgot password process',
        unexpectedError
      );
    });
  });
});
