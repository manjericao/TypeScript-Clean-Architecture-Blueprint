import { CreateTokenDTO, UpdateTokenDTO } from '@enterprise/dto/input/token';
import { TokenResponseDTO } from '@enterprise/dto/output';

/**
 * Interface for the repository handling token data.
 *
 * @interface
 */
export interface ITokenRepository {
  /**
   * Creates a new token with the provided data.
   *
   * @async
   * @param {CreateTokenDTO} data - The token data to be created.
   * @returns {Promise<TokenResponseDTO>} The created token data.
   */
  create(data: CreateTokenDTO): Promise<TokenResponseDTO>;

  /**
   * Finds a token by its ID.
   *
   * @param {string} id - The ID of the token.
   * @returns {Promise<TokenResponseDTO | undefined>} The found token data, or undefined if not found.
   */
  findById(id: string): Promise<TokenResponseDTO | undefined>;

  /**
   * Finds tokens by user ID.
   *
   * @param {string} userId - The ID of the user.
   * @returns {Promise<TokenResponseDTO[]>} Array of tokens belonging to the specified user.
   */
  findByUserId(userId: string): Promise<TokenResponseDTO[]>;

  /**
   * Finds a token by its token string value.
   *
   * @param {string} token - The token string to search for.
   * @returns {Promise<TokenResponseDTO | undefined>} The found token data, or undefined if not found.
   */
  findByToken(token: string): Promise<TokenResponseDTO | undefined>;

  /**
   * Updates token information.
   *
   * @param {string} id - The ID of the token to update.
   * @param {Partial<UpdateTokenDTO>} data - The token data to update.
   * @returns {Promise<TokenResponseDTO>} The updated token.
   */
  update(id: string, data: UpdateTokenDTO): Promise<TokenResponseDTO>;

  /**
   * Marks a token as revoked.
   *
   * @param {string} id - The ID of the token to be revoked.
   * @returns {Promise<TokenResponseDTO>} The updated token data with isRevoked set to true.
   */
  revoke(id: string): Promise<TokenResponseDTO>;

  /**
   * Deletes a token by its ID.
   *
   * @param {string} id - The ID of the token to be deleted.
   * @returns {Promise<void>} A promise that resolves when the token is deleted.
   */
  delete(id: string): Promise<void>;

  /**
   * Removes all expired tokens from the system.
   *
   * @returns {Promise<number>} The number of tokens deleted.
   */
  removeExpired(): Promise<number>;
}
