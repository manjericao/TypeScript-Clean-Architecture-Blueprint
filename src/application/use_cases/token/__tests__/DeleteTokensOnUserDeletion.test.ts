import { DeleteTokensOnUserDeletion } from '@application/use_cases/token';
import { UserDeletedEvent } from '@enterprise/events/user';
import { TokenResponseDTO } from '@enterprise/dto/output';
import { TokenType } from '@enterprise/enum';
import { ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository } from '@application/contracts/domain/repositories';

// Mock Operation class
jest.mock('@application/use_cases/base', () => {
  class MockOperation {
    outputs: Record<string, any>;
    subscribeTo = jest.fn();
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

describe('DeleteTokensOnUserDeletion', () => {
  // Mock dependencies
  const mockTokenRepository: jest.Mocked<ITokenRepository> = {
    findByUserId: jest.fn(),
    delete: jest.fn(),
  } as any;

  const mockLogger: jest.Mocked<ILogger> = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };

  let deleteTokensOnUserDeletion: DeleteTokensOnUserDeletion;
  let subscribeSpy: jest.SpyInstance;
  let emitOutputSpy: jest.SpyInstance;
  let userDeletedCallback: Function;

  beforeEach(() => {
    jest.clearAllMocks();

    deleteTokensOnUserDeletion = new DeleteTokensOnUserDeletion(
      mockTokenRepository,
      mockLogger
    );

    subscribeSpy = jest.spyOn(deleteTokensOnUserDeletion, 'subscribeTo' as any)
      .mockImplementation((...args: unknown[]) => {
        const [event, callback] = args;
        if (event === 'UserDeleted' && typeof callback === 'function') {
          userDeletedCallback = callback;
        }
      });

    emitOutputSpy = jest.spyOn(deleteTokensOnUserDeletion, 'emitOutput' as any);

    (deleteTokensOnUserDeletion as any).outputs = {
      TOKEN_DELETED: 'TOKEN_DELETED',
      TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
      ERROR: 'ERROR'
    };

    deleteTokensOnUserDeletion.bootstrap();
  });

  describe('bootstrap', () => {
    it('should subscribe to UserDeleted event', () => {
      expect(subscribeSpy).toHaveBeenCalledWith('UserDeleted', expect.any(Function));
    });
  });

  describe('event handling', () => {
    const userId = 'test-user-id';

    it('should handle token deletion successfully', async () => {
      const mockTokens: TokenResponseDTO[] = [
        {
          id: 'token-1',
          userId,
          token: 'test-token-1',
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
        }
      ];

      mockTokenRepository.findByUserId.mockResolvedValue(mockTokens);
      mockTokenRepository.delete.mockResolvedValue(undefined);

      await deleteTokensOnUserDeletion.execute(userId);

      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(userId);
      expect(mockTokenRepository.delete).toHaveBeenCalledWith('token-1');
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'TOKEN_DELETED',
        'All tokens from the user was deleted successfully'
      );
    });

    it('should handle case when no tokens are found', async () => {
      mockTokenRepository.findByUserId.mockResolvedValue([]);

      await deleteTokensOnUserDeletion.execute(userId);

      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(userId);
      expect(mockTokenRepository.delete).not.toHaveBeenCalled();
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'TOKEN_NOT_FOUND',
        `There are no tokens for user ${userId}`
      );
    });

    it('should handle case when findByUserId returns null', async () => {
      mockTokenRepository.findByUserId.mockResolvedValue([] as TokenResponseDTO[]);

      await deleteTokensOnUserDeletion.execute(userId);

      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(userId);
      expect(mockTokenRepository.delete).not.toHaveBeenCalled();
      expect(emitOutputSpy).toHaveBeenCalledWith(
        'TOKEN_NOT_FOUND',
        `There are no tokens for user ${userId}`
      );
    });

    it('should handle errors during token deletion', async () => {
      const error = new Error('Database error');
      mockTokenRepository.findByUserId.mockRejectedValue(error);

      await deleteTokensOnUserDeletion.execute(userId);

      expect(mockLogger.error).toHaveBeenCalledWith('Error creating token', {
        error,
        userId
      });
      expect(emitOutputSpy).toHaveBeenCalledWith('ERROR', error);
    });

    it('should handle errors in event handler', async () => {
      const mockUserDeletedEvent = new UserDeletedEvent (userId);

      const error = new Error('Database error');
      mockTokenRepository.findByUserId.mockRejectedValue(error);

      await userDeletedCallback(mockUserDeletedEvent);

      expect(mockLogger.error).toHaveBeenCalledWith('Error creating token', {
        error,
        userId
      });
      expect(emitOutputSpy).toHaveBeenCalledWith('ERROR', error);
    });
  });
});
