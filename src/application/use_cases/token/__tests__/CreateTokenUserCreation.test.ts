import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { faker } from '@faker-js/faker';
import { EventEmitter } from 'events'; // To spy on event subscriptions

// --- Interfaces, Types, DTOs, Enums, Events to Mock/Use ---
import { ITokenRepository } from '@application/contracts/domain/repositories';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenGenerator } from '@application/contracts/security/authentication';
import { OperationError } from '@application/use_cases/base';
import { CreateTokenDTO } from '@enterprise/dto/input/token';
import { TokenResponseDTO, UserResponseDTO } from '@enterprise/dto/output';
import { TokenType, UserRole } from '@enterprise/enum';
import { TokenCreatedEvent } from '@enterprise/events/token';
import { UserCreatedEvent } from '@enterprise/events/user';

// --- Class Under Test ---
import { CreateTokenOnUserCreation } from '@application/use_cases/token/CreateTokenOnUserCreation'; // Adjust path as needed

// --- Mocks ---

// Mock BaseOperation event/subscription methods
const mockEmitSuccess = jest.fn();
const mockEmitError = jest.fn();
const mockPublishDomainEvent = jest.fn();
// subscribeTo will be spied on using EventEmitter or the instance itself

const mockTokenRepository: jest.Mocked<ITokenRepository> = {
  create: jest.fn(),
  // Mock other methods from the interface for completeness
  findById: jest.fn(),
  findByToken: jest.fn(),
  findByUserId: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  revoke: jest.fn(),
  removeExpired: jest.fn(),
};

const mockTokenGenerator: jest.Mocked<ITokenGenerator> = {
  generateToken: jest.fn(),
  validateToken: jest.fn(), // Include other methods if they exist on the interface
};

const mockConfig: jest.Mocked<IConfig> = {
  env: 'dev',
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

// --- Helper Functions ---

const createFakeUserResponseDTO = (): UserResponseDTO => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  username: faker.internet.username(),
  role: faker.helpers.enumValue(UserRole),
  isVerified: faker.datatype.boolean()
});

// Adjust TokenResponseDTO creation based on its actual structure
const createFakeTokenResponseDTO = (userId: string, tokenValue: string, expiresAt: Date): TokenResponseDTO => ({
  id: faker.string.uuid(),
  userId: userId,
  token: tokenValue,
  type: TokenType.VERIFICATION, // Specific to this use case
  expiresAt: expiresAt,
  isRevoked: false,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  // Mock DTO methods if necessary
  isExpired: jest.fn(() => false),
  isValid: jest.fn(() => true),
});

// --- Test Suite ---

describe('CreateTokenOnUserCreation Use Case', () => {
  let createTokenOnUserCreation: CreateTokenOnUserCreation;
  let fakeUser: UserResponseDTO;
  let fakeTokenString: string;
  let fakeExpiresAt: Date;
  let fakeCreatedToken: TokenResponseDTO;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Instantiate the use case with mocks
    createTokenOnUserCreation = new CreateTokenOnUserCreation(
      mockTokenRepository,
      mockTokenGenerator,
      mockConfig,
      mockLogger
    );

    // Override BaseOperation methods with mocks for this instance
    (createTokenOnUserCreation as any).emitSuccess = mockEmitSuccess;
    (createTokenOnUserCreation as any).emitError = mockEmitError;
    (createTokenOnUserCreation as any).publishDomainEvent = mockPublishDomainEvent; // Mock if it exists on BaseOperation

    // Prepare default fake data
    fakeUser = createFakeUserResponseDTO();
    fakeTokenString = faker.string.alphanumeric(64);
    const now = new Date();
    fakeExpiresAt = new Date(now.getTime() + mockConfig.jwt.accessExpirationMinutes * 60 * 1000);
    fakeCreatedToken = createFakeTokenResponseDTO(fakeUser.id, fakeTokenString, fakeExpiresAt);

  });

  afterEach(() => {
    // Restore any spies created on prototypes
    jest.restoreAllMocks();
  });

  // --- Test Cases for 'bootstrap' method ---

  describe('bootstrap', () => {
    it('should subscribe to UserCreated event using EventEmitter', () => {
      // Spy on EventEmitter.prototype.on, assuming BaseOperation uses it internally
      const onSpy = jest.spyOn(EventEmitter.prototype, 'on');

      createTokenOnUserCreation.bootstrap();

      expect(onSpy).toHaveBeenCalledWith(
        'UserCreated',
        expect.any(Function) // The handler function
      );
    });

    it('should handle UserCreated event by calling handleUserCreated', async () => {
      // Spy on the private handleUserCreated method
      const handleUserCreatedSpy = jest
        .spyOn(createTokenOnUserCreation as any, 'handleUserCreated')
        .mockResolvedValue(undefined); // Prevent actual execution

      // Spy on the protected subscribeTo method (if accessible, otherwise use EventEmitter spy)
      const subscribeToSpy = jest.spyOn(createTokenOnUserCreation as any, 'subscribeTo');

      // Call bootstrap
      createTokenOnUserCreation.bootstrap();

      // Ensure subscribeTo was called
      expect(subscribeToSpy).toHaveBeenCalledWith(
        'UserCreated',
        expect.any(Function)
      );

      // Get the handler function from the spy
      const eventHandler = subscribeToSpy.mock.calls[0][1] as (event: UserCreatedEvent) => Promise<void>;

      // Create a fake event
      const fakeEvent = new UserCreatedEvent(fakeUser);

      // Execute the handler
      await eventHandler(fakeEvent);

      // Verify handleUserCreated was called
      expect(handleUserCreatedSpy).toHaveBeenCalledTimes(1);
      expect(handleUserCreatedSpy).toHaveBeenCalledWith(fakeEvent);
    });

    it('should log an error if handleUserCreated rejects', async () => {
      const testError = new Error('Handler failed!');

      // Spy and mock handleUserCreated to reject
      const handleUserCreatedSpy = jest
        .spyOn(createTokenOnUserCreation as any, 'handleUserCreated')
        .mockRejectedValue(testError);

      const subscribeToSpy = jest.spyOn(createTokenOnUserCreation as any, 'subscribeTo');

      // Call bootstrap
      createTokenOnUserCreation.bootstrap();

      // Get the handler function
      const eventHandler = subscribeToSpy.mock.calls[0][1] as (event: UserCreatedEvent) => Promise<void>;

      // Create a fake event
      const fakeEvent = new UserCreatedEvent(fakeUser);

      // Execute the handler (error should be caught internally by the wrapper in bootstrap)
      await eventHandler(fakeEvent);

      // Verify handleUserCreated was called
      expect(handleUserCreatedSpy).toHaveBeenCalledWith(fakeEvent);

      // Verify logger.error was called due to the caught error in the bootstrap handler
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Error handling UserCreated event for user ${fakeUser.id}`),
        expect.objectContaining({
          error: testError, // The original error should be logged
          userId: fakeUser.id,
          operation: 'CreateTokenOnUserCreation'
        })
      );
      // Ensure the operation's main error emitter wasn't called from the handler's catch
      expect(mockEmitError).not.toHaveBeenCalled();
    });
  });

  // --- Test Cases for 'handleUserCreated' (private method, tested via bootstrap) ---

  describe('handleUserCreated', () => {
    it('should log info and call execute with the user DTO from the event', async () => {
      // Spy on execute method
      const executeSpy = jest.spyOn(createTokenOnUserCreation, 'execute').mockResolvedValue(undefined);
      const fakeEvent = new UserCreatedEvent(fakeUser);

      // --- Setup to call the handler ---
      const subscribeToSpy = jest.spyOn(createTokenOnUserCreation as any, 'subscribeTo');
      createTokenOnUserCreation.bootstrap(); // Set up the subscription
      subscribeToSpy.mock.calls[0][1] as (event: UserCreatedEvent) => Promise<void>;
      // ---

      // Call the actual handler function directly or via event emission if preferred
      await (createTokenOnUserCreation as any).handleUserCreated(fakeEvent); // Direct call for focused test

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('User created event received, preparing to create verification token.'),
        expect.objectContaining({ userId: fakeUser.id, operation: 'CreateTokenOnUserCreation' })
      );

      // Verify execute was called correctly
      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(executeSpy).toHaveBeenCalledWith(fakeUser); // Ensure the user DTO is passed
    });
  });


  // --- Test Cases for 'execute' method ---

  describe('execute', () => {
    // --- Success Path ---
    it('should emit SUCCESS when token is generated and created successfully', async () => {
      // Arrange
      const expectedExpirationSeconds = mockConfig.jwt.accessExpirationMinutes * 60;
      mockTokenGenerator.generateToken.mockReturnValue(fakeTokenString);
      mockTokenRepository.create.mockResolvedValue(fakeCreatedToken);

      const expectedSuccessPayload = {
        user: fakeUser,
        createdToken: fakeCreatedToken,
      };

      // Use fake timers to control Date for the approximate check
      const now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);

      // Act
      await createTokenOnUserCreation.execute(fakeUser);

      // Assert
      // 1. Logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        `CreateTokenOnUserCreation operation started.`,
        expect.objectContaining({ userId: fakeUser.id })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Attempting to create verification token in repository.',
        expect.objectContaining({ userId: fakeUser.id })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Verification token created successfully.',
        expect.objectContaining({ userId: fakeUser.id, tokenId: fakeCreatedToken.id })
      );

      // 2. Token Generation
      expect(mockTokenGenerator.generateToken).toHaveBeenCalledTimes(1);
      // Verify parameters passed to generateToken
      expect(mockTokenGenerator.generateToken).toHaveBeenCalledWith(
        TokenType.VERIFICATION,
        expectedExpirationSeconds // Ensure expiration is passed correctly (in seconds)
        // We don't pass a payload in this specific use case
      );

      // 3. Token Repository Interaction
      expect(mockTokenRepository.create).toHaveBeenCalledTimes(1);

      // Remove the explicit type annotation here to avoid TS error
      const expectedTokenData = {
        userId: fakeUser.id,
        token: fakeTokenString,
        type: TokenType.VERIFICATION,
        expiresAt: expect.any(Date), // Use the matcher for the assertion
        isRevoked: false,
      };
      // Use expect.objectContaining to allow the matcher
      expect(mockTokenRepository.create).toHaveBeenCalledWith(expect.objectContaining(expectedTokenData));

      // Check date calculation (approximate) - Ensure this check uses the controlled time
      const actualCallArg = mockTokenRepository.create.mock.calls[0][0] as CreateTokenDTO; // Get the actual argument passed
      const actualExpiresAt = actualCallArg.expiresAt;
      const expectedTime = now.getTime() + mockConfig.jwt.accessExpirationMinutes * 60 * 1000;
      // Use toBeCloseTo for potential minor discrepancies in calculation or timing
      expect(actualExpiresAt.getTime()).toBeCloseTo(expectedTime, -2); // Check within ~100ms

      // 4. Domain Event Publishing (Based on CreateTokenOnUserCreation.ts implementation)
      expect(mockPublishDomainEvent).toHaveBeenCalledTimes(1);
      expect(mockPublishDomainEvent).toHaveBeenCalledWith(expect.any(TokenCreatedEvent));
      const publishedEvent = mockPublishDomainEvent.mock.calls[0][0] as TokenCreatedEvent;
      expect(publishedEvent.user).toEqual(fakeUser);

      // 5. Success Event Emission
      expect(mockEmitSuccess).toHaveBeenCalledTimes(1);
      expect(mockEmitSuccess).toHaveBeenCalledWith(expectedSuccessPayload);

      // 6. No Error Emission
      expect(mockEmitError).not.toHaveBeenCalled();

      // Restore real timers
      jest.useRealTimers();
    });

    // --- Failure Path: Token Generation Fails ---
    it('should emit ERROR if token generation fails', async () => {
      // Arrange
      const generationError = new Error('JWT generation failed');
      mockTokenGenerator.generateToken.mockImplementation(() => {
        throw generationError;
      });

      // Act
      await createTokenOnUserCreation.execute(fakeUser);

      // Assert
      // 1. Logging
      expect(mockLogger.info).toHaveBeenCalledWith(`CreateTokenOnUserCreation operation started.`, expect.anything());
      // Error should be logged by emitError

      // 2. No Repository Interaction
      expect(mockTokenRepository.create).not.toHaveBeenCalled();

      // 3. No Domain Event Publishing
      expect(mockPublishDomainEvent).not.toHaveBeenCalled();

      // 4. Error Emission
      expect(mockEmitError).toHaveBeenCalledTimes(1);
      expect(mockEmitError).toHaveBeenCalledWith(expect.any(OperationError));

      const emittedError = mockEmitError.mock.calls[0][0] as OperationError;
      expect(emittedError.code).toBe('TOKEN_CREATION_FAILED');
      expect(emittedError.message).toContain(`Failed to create verification token for user ${fakeUser.id}`);
      expect(emittedError.message).toContain(generationError.message);
      expect(emittedError.details).toBe(generationError);

      // 5. No Success Emission
      expect(mockEmitSuccess).not.toHaveBeenCalled();
    });

    // --- Failure Path: Token Repository Create Fails ---
    it('should emit ERROR if token repository create fails', async () => {
      // Arrange
      const repositoryError = new Error('Database connection error');
      mockTokenGenerator.generateToken.mockReturnValue(fakeTokenString); // Generation succeeds
      mockTokenRepository.create.mockRejectedValue(repositoryError); // Creation fails

      // Act
      await createTokenOnUserCreation.execute(fakeUser);

      // Assert
      // 1. Logging
      expect(mockLogger.info).toHaveBeenCalledWith(`CreateTokenOnUserCreation operation started.`, expect.anything());
      expect(mockLogger.debug).toHaveBeenCalledWith('Attempting to create verification token in repository.', expect.anything());
      // Error should be logged by emitError

      // 2. Token Generation Called
      expect(mockTokenGenerator.generateToken).toHaveBeenCalledTimes(1);

      // 3. Repository Interaction Attempted
      expect(mockTokenRepository.create).toHaveBeenCalledTimes(1);

      // 4. No Domain Event Publishing
      expect(mockPublishDomainEvent).not.toHaveBeenCalled();

      // 5. Error Emission
      expect(mockEmitError).toHaveBeenCalledTimes(1);
      expect(mockEmitError).toHaveBeenCalledWith(expect.any(OperationError));

      const emittedError = mockEmitError.mock.calls[0][0] as OperationError;
      expect(emittedError.code).toBe('TOKEN_CREATION_FAILED');
      expect(emittedError.message).toContain(`Failed to create verification token for user ${fakeUser.id}`);
      expect(emittedError.message).toContain(repositoryError.message);
      expect(emittedError.details).toBe(repositoryError);

      // 6. No Success Emission
      expect(mockEmitSuccess).not.toHaveBeenCalled();
    });
  });
});
