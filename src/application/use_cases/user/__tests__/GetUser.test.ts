import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GetUser } from '../GetUser';
import { IUserRepository } from '@application/contracts/domain/repositories/IUserRepository';
import { UserRole } from '@enterprise/enum/UserRole';
import { UserResponseDTO } from '@enterprise/dto/output/UserResponseDTO';

describe('GetUser Operation', () => {
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let getUser: GetUser;

  // Mock user data
  const mockUser: UserResponseDTO = {
    id: '1',
    username: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    role: UserRole.USER,
    isVerified: true
  };

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findAll: jest.fn(),
      findByUsername: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };

    getUser = new GetUser(mockUserRepository);
  });

  describe('execute', () => {
    it('should emit SUCCESS with user when found by ID', async () => {
      // Arrange
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const notFoundHandler = jest.fn();
      mockUserRepository.findById.mockResolvedValueOnce(mockUser);

      getUser.on('SUCCESS', successHandler);
      getUser.on('ERROR', errorHandler);
      getUser.on('NOTFOUND_ERROR', notFoundHandler);

      // Act
      await getUser.execute('1', '');

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledWith('1');
      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalledWith(mockUser);
      expect(errorHandler).not.toHaveBeenCalled();
      expect(notFoundHandler).not.toHaveBeenCalled();
    });

    it('should try findByEmail when user not found by ID', async () => {
      // Arrange
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const notFoundHandler = jest.fn();
      const email = 'test@example.com';

      mockUserRepository.findById.mockResolvedValueOnce(undefined);
      mockUserRepository.findByEmail.mockResolvedValueOnce(mockUser);

      getUser.on('SUCCESS', successHandler);
      getUser.on('ERROR', errorHandler);
      getUser.on('NOTFOUND_ERROR', notFoundHandler);

      // Act
      await getUser.execute('1', email);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledWith('1');
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(email);
      expect(successHandler).toHaveBeenCalledWith(mockUser);
      expect(errorHandler).not.toHaveBeenCalled();
      expect(notFoundHandler).not.toHaveBeenCalled();
    });

    it('should emit NOTFOUND_ERROR when user not found by either ID or email', async () => {
      // Arrange
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const notFoundHandler = jest.fn();

      mockUserRepository.findById.mockResolvedValueOnce(undefined);
      mockUserRepository.findByEmail.mockResolvedValueOnce(undefined);

      getUser.on('SUCCESS', successHandler);
      getUser.on('ERROR', errorHandler);
      getUser.on('NOTFOUND_ERROR', notFoundHandler);

      // Act
      await getUser.execute('1', 'test@example.com');

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledWith('1');
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(notFoundHandler).toHaveBeenCalledWith('User was not found');
      expect(successHandler).not.toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should emit ERROR when repository throws an Error', async () => {
      // Arrange
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const notFoundHandler = jest.fn();
      const testError = new Error('Database error');

      mockUserRepository.findById.mockRejectedValueOnce(testError);

      getUser.on('SUCCESS', successHandler);
      getUser.on('ERROR', errorHandler);
      getUser.on('NOTFOUND_ERROR', notFoundHandler);

      // Act
      await getUser.execute('1', '');

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledWith('1');
      expect(errorHandler).toHaveBeenCalledWith(testError);
      expect(successHandler).not.toHaveBeenCalled();
      expect(notFoundHandler).not.toHaveBeenCalled();
    });

    it('should emit ERROR with converted Error when repository throws non-Error', async () => {
      // Arrange
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const notFoundHandler = jest.fn();
      const nonErrorValue = 'Database connection failed';

      mockUserRepository.findById.mockRejectedValueOnce(nonErrorValue);

      getUser.on('SUCCESS', successHandler);
      getUser.on('ERROR', errorHandler);
      getUser.on('NOTFOUND_ERROR', notFoundHandler);

      // Act
      await getUser.execute('1', '');

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledWith('1');
      expect(errorHandler).toHaveBeenCalledWith(new Error(String(nonErrorValue)));
      expect(successHandler).not.toHaveBeenCalled();
      expect(notFoundHandler).not.toHaveBeenCalled();
    });
  });
});
