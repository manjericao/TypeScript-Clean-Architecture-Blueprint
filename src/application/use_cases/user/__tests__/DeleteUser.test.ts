import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DeleteUser } from '../DeleteUser';
import { UserRole } from '@enterprise/enum/UserRole';
import { IUserRepository } from '@application/contracts/domain/repositories/IUserRepository';
import { UserResponseDTO } from '@enterprise/dto/output/UserResponseDTO';

describe('DeleteUser Operation', () => {
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let deleteUser: DeleteUser;

  const mockUser: UserResponseDTO = {
    id: '1',
    username: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    role: UserRole.USER,
    isVerified: true,
  };

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
    };

    deleteUser = new DeleteUser(mockUserRepository);
  });

  describe('execute', () => {
    it('should successfully delete a user when found', async () => {
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const notFoundHandler = jest.fn();
      const validationHandler = jest.fn();

      mockUserRepository.findById.mockResolvedValueOnce(mockUser);
      mockUserRepository.delete.mockResolvedValueOnce();

      deleteUser.onTyped('SUCCESS', successHandler);
      deleteUser.onTyped('ERROR', errorHandler);
      deleteUser.onTyped('NOTFOUND_ERROR', notFoundHandler);
      deleteUser.onTyped('VALIDATION_ERROR', validationHandler);

      await deleteUser.execute('1');

      expect(mockUserRepository.findById).toHaveBeenCalledWith('1');
      expect(mockUserRepository.delete).toHaveBeenCalledWith('1');
      expect(successHandler).toHaveBeenCalledWith('Deletion was successful');
      expect(errorHandler).not.toHaveBeenCalled();
      expect(notFoundHandler).not.toHaveBeenCalled();
      expect(validationHandler).not.toHaveBeenCalled();
    });

    it('should emit VALIDATION_ERROR when id is empty', async () => {
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const notFoundHandler = jest.fn();
      const validationHandler = jest.fn();

      deleteUser.onTyped('SUCCESS', successHandler);
      deleteUser.onTyped('ERROR', errorHandler);
      deleteUser.onTyped('NOTFOUND_ERROR', notFoundHandler);
      deleteUser.onTyped('VALIDATION_ERROR', validationHandler);

      await deleteUser.execute('');

      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockUserRepository.delete).not.toHaveBeenCalled();
      expect(validationHandler).toHaveBeenCalledWith('User ID is required');
      expect(successHandler).not.toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(notFoundHandler).not.toHaveBeenCalled();
    });

    it('should emit NOTFOUND_ERROR when user not found', async () => {
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const notFoundHandler = jest.fn();
      const validationHandler = jest.fn();

      mockUserRepository.findById.mockResolvedValueOnce(undefined);

      deleteUser.onTyped('SUCCESS', successHandler);
      deleteUser.onTyped('ERROR', errorHandler);
      deleteUser.onTyped('NOTFOUND_ERROR', notFoundHandler);
      deleteUser.onTyped('VALIDATION_ERROR', validationHandler);

      await deleteUser.execute('1');

      expect(mockUserRepository.findById).toHaveBeenCalledWith('1');
      expect(mockUserRepository.delete).not.toHaveBeenCalled();
      expect(notFoundHandler).toHaveBeenCalledWith('User with id of 1 was not found');
      expect(successHandler).not.toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(validationHandler).not.toHaveBeenCalled();
    });

    it('should emit ERROR when repository throws an error', async () => {
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const notFoundHandler = jest.fn();
      const validationHandler = jest.fn();
      const error = new Error('Database error');

      mockUserRepository.findById.mockRejectedValueOnce(error);

      deleteUser.onTyped('SUCCESS', successHandler);
      deleteUser.onTyped('ERROR', errorHandler);
      deleteUser.onTyped('NOTFOUND_ERROR', notFoundHandler);
      deleteUser.onTyped('VALIDATION_ERROR', validationHandler);

      await deleteUser.execute('1');

      expect(mockUserRepository.findById).toHaveBeenCalledWith('1');
      expect(mockUserRepository.delete).not.toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledWith(error);
      expect(successHandler).not.toHaveBeenCalled();
      expect(notFoundHandler).not.toHaveBeenCalled();
      expect(validationHandler).not.toHaveBeenCalled();
    });
  });
});
