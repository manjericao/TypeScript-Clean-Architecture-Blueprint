import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GetAllUsers } from '../GetAllUsers';
import { UserRole } from '@enterprise/enum/UserRole';
import { IUserRepository } from '@application/contracts/domain/repositories/IUserRepository';
import { PaginationDTO } from '@enterprise/dto/output/PaginationDTO';
import { UserResponseDTO } from '@enterprise/dto/output/UserResponseDTO';

describe('GetAllUsers Operation', () => {
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let getAllUsers: GetAllUsers;

  const mockUsers: UserResponseDTO[] = [
    {
      id: '1',
      username: 'johndoe',
      name: 'John Doe',
      email: 'john@example.com',
      role: UserRole.USER,
      isVerified: true
    },
    {
      id: '2',
      username: 'janesmith',
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: UserRole.ADMIN,
      isVerified: true
    }
  ];

  const mockPaginationData: PaginationDTO<UserResponseDTO> = {
    body: mockUsers,
    total: 2,
    page: 1,
    limit: 10,
    last_page: 1
  };

  beforeEach(() => {
    mockUserRepository = {
      findAll: jest.fn(),
      create: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      findById: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };

    getAllUsers = new GetAllUsers(mockUserRepository);
  });

  describe('execute', () => {
    it('should emit SUCCESS with paginated users when repository call succeeds', async () => {
      // Arrange
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const page = 1;
      const limit = 10;

      mockUserRepository.findAll.mockResolvedValueOnce(mockPaginationData);

      getAllUsers.on('SUCCESS', successHandler);
      getAllUsers.on('ERROR', errorHandler);

      // Act
      await getAllUsers.execute(page, limit);

      // Assert
      expect(mockUserRepository.findAll).toHaveBeenCalledWith(page, limit);
      expect(successHandler).toHaveBeenCalledWith(mockPaginationData); // Changed this line
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should emit ERROR with Error instance when repository throws Error', async () => {
      // Arrange
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const testError = new Error('Database connection failed');
      const page = 1;
      const limit = 10;

      mockUserRepository.findAll.mockRejectedValueOnce(testError);

      getAllUsers.on('SUCCESS', successHandler);
      getAllUsers.on('ERROR', errorHandler);

      // Act
      await getAllUsers.execute(page, limit);

      // Assert
      expect(mockUserRepository.findAll).toHaveBeenCalledWith(page, limit);
      expect(successHandler).not.toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledWith(testError);
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('should emit ERROR with converted Error when repository throws non-Error', async () => {
      // Arrange
      const successHandler = jest.fn();
      const errorHandler = jest.fn();
      const nonErrorValue = 'String error message';
      const page = 1;
      const limit = 10;

      mockUserRepository.findAll.mockRejectedValueOnce(nonErrorValue);

      getAllUsers.on('SUCCESS', successHandler);
      getAllUsers.on('ERROR', errorHandler);

      // Act
      await getAllUsers.execute(page, limit);

      // Assert
      expect(mockUserRepository.findAll).toHaveBeenCalledWith(page, limit);
      expect(successHandler).not.toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledWith(new Error(String(nonErrorValue)));
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });
});
