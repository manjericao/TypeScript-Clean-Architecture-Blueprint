import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';

// --- Application Contracts ---
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenGenerator } from '@application/contracts/security/authentication';

// --- Base Classes & Use Case ---
import { AbstractOperation, OperationError } from '@application/use_cases/base';
import { ForgotPassword } from '@application/use_cases/auth';

// --- Enterprise Layer ---
import { EmailUserDTO } from '@enterprise/dto/input/auth';
import { UserResponseDTO } from '@enterprise/dto/output';
import { Token } from '@enterprise/entities';
import { TokenType, UserRole, Gender } from '@enterprise/enum';
import { ForgotPasswordEvent } from '@enterprise/events/auth';

// --- Mocks ---

const mockUserRepository: jest.Mocked<IUserRepository> = {
  // Implement the necessary methods, others can remain jest.fn() if not used
  findByEmail: jest.fn(),
  // Add other methods if ForgotPassword logic were to expand, e.g., findById: jest.fn()
  findAll: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockTokenRepository: jest.Mocked<ITokenRepository> = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findByToken: jest.fn(),
  update: jest.fn(),
  revoke: jest.fn(),
  delete: jest.fn(),
  removeExpired: jest.fn()
};

const mockTokenGenerator: jest.Mocked<ITokenGenerator> = {
  generateToken: jest.fn(),
  validateToken: jest.fn(),
};

// Mock config needs the specific structure accessed by the class
const mockConfig: jest.Mocked<IConfig> = {
  env: 'test',
  MONGOOSE_DEBUG: false,
  jwt: {
    secret: faker.string.alphanumeric(32),
    accessExpirationMinutes: 15,
    refreshExpirationDays: 7,
    resetPasswordExpirationMinutes: 10,
    verifyEmailExpirationMinutes: 60,
  },
  db: 'mongodb://mock-url',
  db_config: {
    useNewUrlParser: false,
    useUnifiedTopology: false
  },
  redis: {
    host: 'redis://mock-redis',
    port: 2222
  },
  storage: {
    type: 'local',
    aws: {
      bucketName: '',
      accessKeyId: '',
      secretAccessKey: '',
      region: '',
    }
  },
  server: {
    protocol: '',
    host: '',
    port: 5555,
    version: ''
  },
  smtp: {
    host: 'mock-smtp',
    port: 587,
    secure: false,
    debug: false,
    username: '',
    password: '',
    from: ''
  }
};

const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const publishDomainEventSpy = jest.spyOn(AbstractOperation.prototype as any, 'publishDomainEvent');

// --- Helper Functions ---

const createFakeEmailDTO = (): EmailUserDTO => ({
  email: faker.internet.email(),
});

// Helper to create a fake user like the one returned by IUserRepository
const createFakeUser = (isVerified: boolean = true): UserResponseDTO => ({
  id: faker.string.uuid(),
  username: faker.internet.username(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: faker.helpers.arrayElement(Object.values(UserRole)),
  isVerified: isVerified,
});

// Helper to create a fake token like the one returned by ITokenRepository
const createFakeToken = (userId: string, tokenValue: string, expiresAt: Date): Token => ({
  id: faker.string.uuid(),
  token: tokenValue,
  userId: userId,
  type: TokenType.RESET_PASSWORD,
  expiresAt: expiresAt,
  isRevoked: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  isExpired: function(): boolean {
    throw new Error('Function not implemented.');
  },
  isValid: function(): boolean {
    throw new Error('Function not implemented.');
  }
});

// --- Test Suite ---

describe('ForgotPassword Use Case', () => {
  let forgotPassword: ForgotPassword;
  let emailDTO: EmailUserDTO;
  let fakeUser: UserResponseDTO;
  let fakeResetToken: string;
  let fakeSavedToken: Token;
  let expiresAt: Date;

  // Mock event handlers
  let onSuccess: jest.Mock;
  let onError: jest.Mock;
  let onUserNotFound: jest.Mock;
  let onAccountNotVerified: jest.Mock;

  beforeEach(() => {
    // Reset mocks and spies before each test
    jest.resetAllMocks();
    publishDomainEventSpy.mockClear();

    // Instantiate the use case with mocks
    forgotPassword = new ForgotPassword(
      mockUserRepository,
      mockTokenRepository,
      mockTokenGenerator,
      mockConfig,
      mockLogger
    );

    // Initialize mock event handlers
    onSuccess = jest.fn();
    onError = jest.fn();
    onUserNotFound = jest.fn();
    onAccountNotVerified = jest.fn();

    // Attach mock handlers to the use case instance
    forgotPassword.on('SUCCESS', onSuccess);
    forgotPassword.on('ERROR', onError);
    forgotPassword.on('USER_NOT_FOUND', onUserNotFound);
    forgotPassword.on('ACCOUNT_NOT_VERIFIED', onAccountNotVerified);

    // Prepare default fake data
    emailDTO = createFakeEmailDTO();
    fakeUser = createFakeUser(true); // Verified user by default
    fakeResetToken = faker.string.alphanumeric(64);
    // Calculate expiry based on mock config for consistency
    expiresAt = new Date(
      Date.now() + mockConfig.jwt.resetPasswordExpirationMinutes * 60 * 1000
    );
    fakeSavedToken = createFakeToken(fakeUser.id, fakeResetToken, expiresAt);

    // Default mock implementations for a happy path
    mockUserRepository.findByEmail.mockResolvedValue(fakeUser);
    mockTokenGenerator.generateToken.mockReturnValue(fakeResetToken);
    mockTokenRepository.create.mockResolvedValue(fakeSavedToken);
  });

  // --- Test Cases ---

  describe('execute', () => {
    it('should emit SUCCESS when user exists, is verified, and token is generated/saved', async () => {
      // Arrange (already done in beforeEach for a happy path)
      const expectedSuccessMessage = `Forgot Password succeeded for ${emailDTO.email}`;

      // Act
      await forgotPassword.execute(emailDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(emailDTO.email);
      expect(mockTokenGenerator.generateToken).toHaveBeenCalledTimes(1);
      // Example assertion if it takes type and hours:
      expect(mockTokenGenerator.generateToken).toHaveBeenCalledWith(
        TokenType.RESET_PASSWORD,
        expect.any(Number)
      );

      expect(mockTokenRepository.create).toHaveBeenCalledTimes(1);
      expect(mockTokenRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        token: fakeResetToken,
        userId: fakeUser.id,
        type: TokenType.RESET_PASSWORD,
        expiresAt: expect.any(Date), // Check if date is reasonably close if needed
        isRevoked: false,
      }));

      expect(publishDomainEventSpy).toHaveBeenCalledTimes(1);
      expect(publishDomainEventSpy).toHaveBeenCalledWith(expect.any(ForgotPasswordEvent));
      // Check the contents of the event payload
      const publishedEvent = publishDomainEventSpy.mock.calls[0][0] as ForgotPasswordEvent;
      expect(publishedEvent.user).toEqual(fakeUser);
      expect(publishedEvent.token).toEqual(fakeSavedToken);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(expectedSuccessMessage); // Check the success message from the code
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onAccountNotVerified).not.toHaveBeenCalled();

      // Check logs
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ForgotPassword operation started'), expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking for existing user'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Generating password reset token'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Saving password reset token'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Password reset token generated and saved'), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Published ForgotPasswordEvent'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ForgotPassword succeeded'));
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should emit USER_NOT_FOUND when user with the email does not exist', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(undefined); // No user found
      const expectedMessage = `No user found with email ${emailDTO.email}`;

      // Act
      await forgotPassword.execute(emailDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(emailDTO.email);
      expect(mockTokenGenerator.generateToken).not.toHaveBeenCalled();
      expect(mockTokenRepository.create).not.toHaveBeenCalled();
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onUserNotFound).toHaveBeenCalledTimes(1);
      expect(onUserNotFound).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onAccountNotVerified).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining(`ForgotPassword failed: No user found with email ${emailDTO.email}`));
    });

    it('should emit ACCOUNT_NOT_VERIFIED when the user exists but is not verified', async () => {
      // Arrange
      const unverifiedUser = createFakeUser(false); // Not verified
      mockUserRepository.findByEmail.mockResolvedValue(unverifiedUser);
      const expectedMessage = 'Account associated with this email is not verified. Please verify your email before resetting password.';

      // Act
      await forgotPassword.execute(emailDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(emailDTO.email);
      expect(mockTokenGenerator.generateToken).not.toHaveBeenCalled();
      expect(mockTokenRepository.create).not.toHaveBeenCalled();
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onAccountNotVerified).toHaveBeenCalledTimes(1);
      expect(onAccountNotVerified).toHaveBeenCalledWith(expectedMessage);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('ForgotPassword failed: Account associated with this email is not verified'), { email: emailDTO.email });
    });

    it('should emit ERROR when token generation fails', async () => {
      // Arrange
      const generationError = new Error('Token generation failed');
      mockTokenGenerator.generateToken.mockImplementation(() => { throw generationError; }); // Throw error

      // Act
      await forgotPassword.execute(emailDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockTokenGenerator.generateToken).toHaveBeenCalledTimes(1); // It was called
      expect(mockTokenRepository.create).not.toHaveBeenCalled();
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      // Verify the details of the OperationError
      const emittedError = onError.mock.calls[0][0] as OperationError;
      expect(emittedError.code).toBe('FORGOT_PASSWORD_FAILED');
      expect(emittedError.message).toContain(`Failed to process forgot password request for ${emailDTO.email}`);
      expect(emittedError.message).toContain('Token generation failed');
      expect(emittedError.details).toBe(generationError);

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onAccountNotVerified).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('should emit ERROR when saving the token fails', async () => {
      // Arrange
      const saveError = new Error('Database write failed');
      mockTokenRepository.create.mockRejectedValue(saveError); // Reject promise

      // Act
      await forgotPassword.execute(emailDTO);

      // Assert
      expect(mockUserRepository.findByEmail).toHaveBeenCalledTimes(1);
      expect(mockTokenGenerator.generateToken).toHaveBeenCalledTimes(1);
      expect(mockTokenRepository.create).toHaveBeenCalledTimes(1); // It was called
      expect(publishDomainEventSpy).not.toHaveBeenCalled();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(OperationError));
      // Verify the details of the OperationError
      const emittedError = onError.mock.calls[0][0] as OperationError;
      expect(emittedError.code).toBe('FORGOT_PASSWORD_FAILED');
      expect(emittedError.message).toContain(`Failed to process forgot password request for ${emailDTO.email}`);
      expect(emittedError.message).toContain('Database write failed');
      expect(emittedError.details).toBe(saveError);

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onUserNotFound).not.toHaveBeenCalled();
      expect(onAccountNotVerified).not.toHaveBeenCalled();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });
});
