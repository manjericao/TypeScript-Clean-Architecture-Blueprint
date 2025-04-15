import { PaginationDTO, UserResponseDTO } from '@enterprise/dto/output';
import { CreateUserDTO, UpdateUserDTO } from '@enterprise/dto/input/user';
import { UserWithPasswordDTO } from '@enterprise/dto/internal';

/**
 * Interface for the repository handling user data.
 *
 * @interface
 */
export interface IUserRepository {
  /**
   * Creates a new user with the provided data.
   *
   * @async
   * @param {CreateUserDTO} data - The user data to be created.
   * @returns {Promise<UserResponseDTO>} The created user data.
   */
  create(data: CreateUserDTO): Promise<UserResponseDTO>

  /**
   * Finds a user by their email address.
   *
   * @param {string} email - The email address of the user.
   * @returns {Promise<UserResponseDTO | unknown>} The found user data, or undefined if not found.
   */
  findByEmail(email: string): Promise<UserResponseDTO | undefined>

  /**
   * Retrieves a user based on their username.
   *
   * @param {string} username - The username of the user to find.
   * @return {Promise<UserResponseDTO | undefined>} A promise that resolves to the user's details as a UserResponseDTO object, or undefined if the user is not found.
   */
  findByUsername(username: string): Promise<UserResponseDTO | undefined>

  /**
   * Finds a user by their ID.
   *
   * @param {string} id - The ID of the user.
   * @returns {Promise<UserResponseDTO | undefined>} The found user data, or undefined if not found.
   */
  findById(id: string): Promise<UserResponseDTO | undefined>

  /**
   * Retrieves a user by their email address along with their password.
   *
   * @param {string} email - The email address of the user to find.
   * @return {Promise<UserWithPasswordDTO | undefined>} A promise that resolves to the user's data for login
   * or undefined if no user is found.
   */
  findByEmailWithPassword(email: string): Promise<UserWithPasswordDTO | undefined>;

  /**
   * Retrieves a paginated list of users based on the specified page number and limit.
   *
   * @param {number} pageNumber - The current page number to retrieve.
   * @param {number} limit - The maximum number of users to retrieve per page.
   * @return {Promise<PaginationDTO<UserResponseDTO>>} A promise resolving to the paginated list of users.
   */
  findAll(pageNumber: number, limit: number): Promise<PaginationDTO<UserResponseDTO>>;

  /**
   * Updates the user data for the given user ID with the provided partial data.
   *
   * @param {string} id - The unique identifier of the user to be updated.
   * @param {Partial<UpdateUserDTO>} data - An object containing the fields to be updated for the user.
   * @return {Promise<UserResponseDTO>} A promise that resolves to the updated user data.
   */
  update(
    id: string,
    data: Partial<UpdateUserDTO>,
  ): Promise<UserResponseDTO>

  /**
   * Deletes a user by their ID.
   *
   * @param {string} id - The ID of the user to be deleted.
   * @returns {Promise<void>} A promise that resolves when the user is deleted.
   */
  delete(id: string): Promise<void>
}
