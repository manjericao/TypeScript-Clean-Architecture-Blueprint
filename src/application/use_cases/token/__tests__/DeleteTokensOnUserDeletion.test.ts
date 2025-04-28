import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';
import { EventEmitter } from 'events'; // For spying on event subscriptions

// --- Interfaces, Types, DTOs, Enums, Events to Mock/Use ---
import { ITokenRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { OperationError } from '@application/use_cases/base';
import { TokenResponseDTO } from '@enterprise/dto/output';
import { TokenType } from '@enterprise/enum';
import { UserDeletedEvent } from '@enterprise/events/user';

// --- Class Under Test ---
import { DeleteTokensOnUserDeletion } from '@application/use_cases/token/DeleteTokensOnUserDeletion';

// --- Mocks ---

// Mock BaseOperation event/subscription methods
const mockEmitOutput = jest.fn();
const mockEmitSuccess = jest.fn();
const mockEmitError = jest.fn();
// subscribeTo will be spied on using EventEmitter or the instance itself

const mockTokenRepository: jest.Mocked<ITokenRepository> = {
  findByUserId: jest.fn(),
  delete: jest.fn(),
  // Mock other methods from the interface for completeness
  create: jest.fn(),
  findById: jest.fn(),
  findByToken: jest.fn(),
  update: jest.fn(),
  revoke: jest.fn(),
  removeExpired: jest.fn()
};

const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// --- Helper Functions ---

// Adjust TokenResponseDTO creation if its structure differs or needs specific adapters
const createFakeTokenResponseDTO = (userId: string, type = TokenType.ACCESS): TokenResponseDTO => ({
  id: faker.string.uuid(),
  userId: userId,
  token: faker.string.alphanumeric(64),
  type: type,
  expiresAt: faker.date.future({ years: 0.1 }),
  isRevoked: false,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
  // Mock DTO methods if necessary
  isExpired: jest.fn(() => false),
  isValid: jest.fn(() => true)
});

// --- Test Suite ---

describe('DeleteTokensOnUserDeletion Use Case', () => {
  let deleteTokensOnUserDeletion: DeleteTokensOnUserDeletion;
  let fakeUserId: string;
  let fakeTokens: TokenResponseDTO[];

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Instantiate the use case with mocks
    deleteTokensOnUserDeletion = new DeleteTokensOnUserDeletion(
      mockTokenRepository,
      mockLogger
    );

    // Override BaseOperation event emitters with mocks for this instance
    (deleteTokensOnUserDeletion as any).emitSuccess = mockEmitSuccess;
    (deleteTokensOnUserDeletion as any).emitOutput  = mockEmitOutput;
    (deleteTokensOnUserDeletion as any).emitError   = mockEmitError;

    // Prepare default fake data
    fakeUserId = faker.string.uuid();
    // Create a mix of token adapters for deletion
    fakeTokens = [
      createFakeTokenResponseDTO(fakeUserId, TokenType.ACCESS),
      createFakeTokenResponseDTO(fakeUserId, TokenType.REFRESH),
      createFakeTokenResponseDTO(fakeUserId, TokenType.VERIFICATION)
    ];
  });

  // --- Test Cases for 'bootstrap' method ---

  describe('bootstrap', () => {
    it('should subscribe to UserDeleted event using EventEmitter', () => {
      // Spy on EventEmitter.prototype.on, which is used by subscribeTo internally.
      const onSpy = jest.spyOn(EventEmitter.prototype, 'on');

      deleteTokensOnUserDeletion.bootstrap();

      expect(onSpy).toHaveBeenCalledWith(
        'UserDeleted',
        expect.any(Function) // The handler function
      );

      // Restore the spy
      onSpy.mockRestore();
    });

    it('should handle UserDeleted event by calling handleUserDeletion', async () => {
      // Spy on the private handleUserDeletion method
      const handleUserDeletionSpy = jest
        .spyOn(deleteTokensOnUserDeletion as any, 'handleUserDeletion')
        .mockResolvedValue(undefined); // Prevent actual execution

      // Spy on the protected subscribeTo method
      const subscribeToSpy = jest.spyOn(deleteTokensOnUserDeletion as any, 'subscribeTo');

      // Call bootstrap
      deleteTokensOnUserDeletion.bootstrap();

      // Ensure subscribeTo was called
      expect(subscribeToSpy).toHaveBeenCalledWith(
        'UserDeleted',
        expect.any(Function)
      );

      // Get the handler function
      const eventHandler = subscribeToSpy.mock.calls[0][1] as (event: any) => Promise<void>;

      // Create a fake event
      const fakeEvent = new UserDeletedEvent(fakeUserId);

      // Execute the handler
      await eventHandler(fakeEvent);

      // Verify handleUserDeletion was called
      expect(handleUserDeletionSpy).toHaveBeenCalledTimes(1);
      expect(handleUserDeletionSpy).toHaveBeenCalledWith(fakeEvent);
    });

    it('should log an error if handleUserDeletion rejects', async () => {
      const testError = new Error('Handler failed unexpectedly');

      // Spy and mock handleUserDeletion to reject
      const handleUserDeletionSpy = jest
        .spyOn(deleteTokensOnUserDeletion as any, 'handleUserDeletion')
        .mockRejectedValue(testError);

      // Spy on subscribeTo
      const subscribeToSpy = jest.spyOn(deleteTokensOnUserDeletion as any, 'subscribeTo');

      // Call bootstrap
      deleteTokensOnUserDeletion.bootstrap();

      // Get the handler function
      const eventHandler = subscribeToSpy.mock.calls[0][1] as (event: any) => Promise<void>;

      // Create a fake event
      const fakeEvent = new UserDeletedEvent(fakeUserId);

      // Execute the handler (error should be caught internally)
      await eventHandler(fakeEvent);

      // Verify handleUserDeletion was called
      expect(handleUserDeletionSpy).toHaveBeenCalledWith(fakeEvent);

      // Verify logger.error was called due to the caught error
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Error handling UserDeleted event for user ${fakeUserId}`),
        expect.objectContaining({
          error: testError, // The original error should be logged
          userId: fakeUserId,
          operation: 'DeleteTokensOnUserDeletion'
        })
      );
    });
  });

  // --- Test Cases for 'handleUserDeletion' (private method, tested via bootstrap/direct call) ---

  describe('handleUserDeletion', () => {
    it('should log info and call execute with the userId from the event', async () => {
      // Spy on execute method
      const executeSpy = jest.spyOn(deleteTokensOnUserDeletion, 'execute').mockResolvedValue(undefined);
      const fakeEvent = new UserDeletedEvent(fakeUserId);

      // Call the private method directly
      await (deleteTokensOnUserDeletion as any).handleUserDeletion(fakeEvent);

      // Verify logs
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('User deletion event received'),
        expect.objectContaining({ userId: fakeUserId, operation: 'DeleteTokensOnUserDeletion' })
      );

      // Verify execute was called correctly
      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(executeSpy).toHaveBeenCalledWith(fakeUserId);
    });
  });


  // --- Test Cases for 'execute' method ---

  describe('execute', () => {
    // --- Success Path ---
    it('should emit SUCCESS when tokens are found and deleted successfully', async () => {
      // Arrange
      mockTokenRepository.findByUserId.mockResolvedValue(fakeTokens);
      mockTokenRepository.delete.mockResolvedValue(undefined); // Assume delete succeeds

      const expectedSuccessPayload = {
        userId: fakeUserId,
        deletedCount: fakeTokens.length
      };

      // Act
      await deleteTokensOnUserDeletion.execute(fakeUserId);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        `DeleteTokensOnUserDeletion operation started.`,
        expect.objectContaining({ userId: fakeUserId })
      );
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledTimes(1);
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUserId);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Found ${fakeTokens.length} token(s) to delete.`,
        expect.objectContaining({ userId: fakeUserId })
      );
      // Ensure delete was called for each token
      expect(mockTokenRepository.delete).toHaveBeenCalledTimes(fakeTokens.length);
      fakeTokens.forEach(token => {
        expect(mockTokenRepository.delete).toHaveBeenCalledWith(token.id);
      });
      expect(mockEmitSuccess).toHaveBeenCalledTimes(1);
      expect(mockEmitSuccess).toHaveBeenCalledWith(expectedSuccessPayload);
      expect(mockEmitOutput).not.toHaveBeenCalled();
      expect(mockEmitError).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Successfully deleted ${expectedSuccessPayload.deletedCount} token(s) for user.`,
        expect.objectContaining({ userId: fakeUserId })
      );
    });

    // --- Edge Case: No Tokens Found ---
    it('should emit TOKEN_NOT_FOUND when no tokens exist for the user', async () => {
      // Arrange
      mockTokenRepository.findByUserId.mockResolvedValue([]); // No tokens found

      const expectedNotFoundPayload = { userId: fakeUserId };

      // Act
      await deleteTokensOnUserDeletion.execute(fakeUserId);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledTimes(1);
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUserId);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`No tokens found for user ${fakeUserId}`),
        expect.objectContaining({ userId: fakeUserId })
      );
      expect(mockEmitOutput).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledWith('TOKEN_NOT_FOUND', expectedNotFoundPayload);
      expect(mockTokenRepository.delete).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmitError).not.toHaveBeenCalled();
    });

    // --- Edge Case: Null returned from findByUserId ---
    it('should emit TOKEN_NOT_FOUND when null is returned for tokens', async () => {
      // Arrange
      mockTokenRepository.findByUserId.mockResolvedValue(null as any); // Simulate null return

      const expectedNotFoundPayload = { userId: fakeUserId };

      // Act
      await deleteTokensOnUserDeletion.execute(fakeUserId);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledTimes(1);
      expect(mockEmitOutput).toHaveBeenCalledWith('TOKEN_NOT_FOUND', expectedNotFoundPayload);
      expect(mockTokenRepository.delete).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmitError).not.toHaveBeenCalled();
    });

    // --- Error Case: findByUserId fails ---
    it('should emit ERROR if tokenRepository.findByUserId rejects', async () => {
      // Arrange
      const repositoryError = new Error('Database connection failed');
      mockTokenRepository.findByUserId.mockRejectedValue(repositoryError);

      // Act
      await deleteTokensOnUserDeletion.execute(fakeUserId);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledTimes(1);
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledWith(fakeUserId);
      expect(mockEmitError).toHaveBeenCalledTimes(1);
      expect(mockEmitError).toHaveBeenCalledWith(expect.any(OperationError));
      const emittedError = mockEmitError.mock.calls[0][0] as OperationError;
      expect(emittedError.code).toBe('TOKEN_DELETION_FAILED');
      expect(emittedError.message).toContain(`Failed to delete tokens for user ${fakeUserId}`);
      expect(emittedError.message).toContain(repositoryError.message);
      expect(emittedError.details).toBe(repositoryError);
      expect(mockTokenRepository.delete).not.toHaveBeenCalled();
      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmitOutput).not.toHaveBeenCalled();
    });

    // --- Error Case: delete fails ---
    it('should emit ERROR if tokenRepository.delete rejects for any token', async () => {
      // Arrange
      const deleteError = new Error('Cannot delete token');
      mockTokenRepository.findByUserId.mockResolvedValue(fakeTokens);
      // Make the first delete call fail
      mockTokenRepository.delete.mockRejectedValueOnce(deleteError);

      // Act
      await deleteTokensOnUserDeletion.execute(fakeUserId);

      // Assert
      expect(mockTokenRepository.findByUserId).toHaveBeenCalledTimes(1);
      // Delete should have been called at least once (the one that failed)
      expect(mockTokenRepository.delete).toHaveBeenCalledTimes(3);
      expect(mockTokenRepository.delete).toHaveBeenCalledWith(fakeTokens[0].id);

      expect(mockEmitError).toHaveBeenCalledTimes(1);
      expect(mockEmitError).toHaveBeenCalledWith(expect.any(OperationError));
      const emittedError = mockEmitError.mock.calls[0][0] as OperationError;
      expect(emittedError.code).toBe('TOKEN_DELETION_FAILED');
      expect(emittedError.message).toContain(`Failed to delete tokens for user ${fakeUserId}`);
      expect(emittedError.message).toContain(deleteError.message);
      expect(emittedError.details).toBe(deleteError); // Check the cause

      expect(mockEmitSuccess).not.toHaveBeenCalled();
      expect(mockEmitOutput).not.toHaveBeenCalled();
    });
  });
});
