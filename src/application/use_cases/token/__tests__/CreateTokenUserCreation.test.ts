import { CreateTokenOnUserCreation } from '../CreateTokenOnUserCreation';
import { UserCreatedEvent } from '@enterprise/events/user';
import { TokenType, UserRole } from '@enterprise/enum';
import { TokenResponseDTO } from '@enterprise/dto/output';
import { UserResponseDTO } from '@enterprise/dto/output';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenGenerator } from '@application/contracts/security/authentication';
import { ITokenRepository } from '@application/contracts/domain/repositories';

// Mocks
jest.mock('@application/use_cases/base', () => {
  // Create a mock class that matches the Operation structure
  class MockOperation {
    outputs: Record<string, any>;
    subscribeTo = jest.fn();  // Instance method, not static
    emitOutput = jest.fn();
    publishDomainEvent = jest.fn();

    constructor(outputNames: string[]) {
      this.outputs = outputNames.reduce((acc, name) => ({
        ...acc,
        [name]: name
      }), {});
    }
  }

  return {
    Operation: MockOperation
  };
});

describe('CreateTokenUserCreation', () => {
  // Mock dependencies
  const mockTokenRepository: jest.Mocked<ITokenRepository> = {
    create: jest.fn(),
  } as any;

  const mockGenerateToken: jest.Mocked<ITokenGenerator> = {
    generateToken: jest.fn(),
    validateToken: jest.fn(),
  };

  const mockConfig: jest.Mocked<IConfig> = {
    jwt: {
      accessExpirationMinutes: 60,
      secret: 'test-secret'
    }
  } as any;

  const mockLogger: jest.Mocked<ILogger> = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };

  let createTokenUserCreation: CreateTokenOnUserCreation;
  let subscribeSpy: jest.SpyInstance;
  let emitOutputSpy: jest.SpyInstance;
  let userCreatedCallback: Function;

  beforeEach(() => {
    jest.clearAllMocks();

    createTokenUserCreation = new CreateTokenOnUserCreation(
      mockTokenRepository,
      mockGenerateToken,
      mockConfig,
      mockLogger
    );

    subscribeSpy = jest.spyOn(createTokenUserCreation, 'subscribeTo' as any)
      .mockImplementation((...args: unknown[]) => {
        const [event, callback] = args;
        if (event === 'UserCreated' && typeof callback === 'function') {
          userCreatedCallback = callback;
        }
      });

    emitOutputSpy = jest.spyOn(createTokenUserCreation, 'emitOutput' as any);

    (createTokenUserCreation as any).outputs = {
      TOKEN_CREATED: 'TOKEN_CREATED',
      ERROR: 'ERROR'
    };

    // Call bootstrap to trigger the subscription
    createTokenUserCreation.bootstrap();
  });

  describe('execute', () => {
    const mockUser: UserResponseDTO = {
      name: 'Test User',
      id: 'test-user-id',
      email: 'test@example.com',
      username: 'Test',
      role: UserRole.USER,
      isVerified: false
    };

    const mockToken = 'test-token';
    const mockCreatedToken: TokenResponseDTO = {
      isExpired(): boolean {
        return false;
      },
      isValid(): boolean {
        return false;
      },
      id: 'token-id',
      userId: mockUser.id,
      token: mockToken,
      type: TokenType.VERIFICATION,
      expiresAt: new Date(),
      isRevoked: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should generate and create a token successfully', async () => {
      // Mock dependencies
      mockGenerateToken.generateToken.mockReturnValue(mockToken);
      mockTokenRepository.create.mockResolvedValue(mockCreatedToken);

      // Execute
      await createTokenUserCreation.execute(mockUser);

      // Verify token generation
      expect(mockGenerateToken.generateToken).toHaveBeenCalledWith(
        TokenType.VERIFICATION,
        mockConfig.jwt.accessExpirationMinutes
      );

      // Verify token creation
      expect(mockTokenRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: mockUser.id,
        token: mockToken,
        type: TokenType.VERIFICATION,
        isRevoked: false
      }));

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith('Token created successfully',
        expect.objectContaining({
          userId: mockUser.id
        })
      );

      // Verify event emission
      expect(emitOutputSpy).toHaveBeenCalledWith('TOKEN_CREATED', {
        user: mockUser
      });
    });

    it('should handle errors during token creation', async () => {
      const testError = new Error('Token creation failed');
      mockGenerateToken.generateToken.mockImplementation(() => {
        throw testError;
      });

      await createTokenUserCreation.execute(mockUser);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error creating token',
        {
          error: testError,  // The actual error object, not just the message
          userId: mockUser.id
        }
      );
      expect(emitOutputSpy).toHaveBeenCalledWith('ERROR', testError);
    });

    it('should properly handle UserCreated event', async () => {
      // Verify callback was set
      expect(userCreatedCallback).toBeDefined();

      const mockUserCreatedEvent = new UserCreatedEvent (
        mockUser );

      // Set up successful responses
      mockGenerateToken.generateToken.mockReturnValue('test-token');
      mockTokenRepository.create.mockResolvedValue({} as any);

      // Call the event handler
      await userCreatedCallback(mockUserCreatedEvent);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User created event received, generating token',
        expect.objectContaining({
          userId: mockUser.id
        })
      );

      // Verify token was attempted to be created
      expect(mockGenerateToken.generateToken).toHaveBeenCalled();
      expect(mockTokenRepository.create).toHaveBeenCalled();
    });
  });

  describe('event handling', () => {
    it('should handle UserCreated event', async () => {
      const userId = 'test-user-id';
      const mockToken = 'test-token';

      const mockCreatedToken: TokenResponseDTO = {
        id: 'token-id',
        userId,
        token: mockToken,
        type: TokenType.VERIFICATION,
        expiresAt: new Date(),
        isRevoked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isExpired: function(): boolean {
          throw new Error('Function not implemented.');
        },
        isValid: function(): boolean {
          throw new Error('Function not implemented.');
        }
      };

      const mockUserCreatedEvent = new UserCreatedEvent (
        {
          id: 'test-user-id',
          username: 'test',
          isVerified: false,
          name: 'test',
          role: UserRole.USER,
          email: 'test@test.com'
        });

      mockGenerateToken.generateToken.mockReturnValue('test-token');
      mockTokenRepository.create.mockResolvedValue(mockCreatedToken);

      // Verify the subscription was made
      expect(subscribeSpy).toHaveBeenCalledWith('UserCreated', expect.any(Function));

      // Call the stored callback with the mock event
      await userCreatedCallback(mockUserCreatedEvent);

      // Verify the token was created with correct user ID
      expect(mockTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          type: TokenType.VERIFICATION,
          isRevoked: false
        })
      );
    });

    it('should handle errors during UserCreated event processing', async () => {
      // Mock an error during token creation
      const testError = new Error('Test error');

      // Mock the execute method to throw an error
      jest.spyOn(createTokenUserCreation, 'execute').mockImplementation(() => {
        throw testError;
      });

      const mockEvent: UserCreatedEvent = {
        user: {
          id: 'user-id'
        }
      } as UserCreatedEvent;

      // Call the callback that was stored during subscribeTo
      await userCreatedCallback(mockEvent);

      // Verify error logging - this is the correct message from the handleUserCreated method
      expect(mockLogger.error).toHaveBeenCalledWith('Error handling UserCreated event',
        expect.objectContaining({
          error: 'Test error',
          userId: 'user-id'
        })
      );

      // Verify error event emission
      expect(emitOutputSpy).toHaveBeenCalledWith('ERROR', testError);
    });
  });
});
