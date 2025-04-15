/**
 * Interface representing a token blacklist service.
 */
export interface ITokenBlackList {
  /**
   * Adds a token to the blacklist with a specified expiration time.
   *
   * @param {string} token - The token to be blacklisted.
   * @param {number} expirationTime - The time in milliseconds after which the token will expire.
   * @return {Promise<void>} A Promise that resolves when the token is successfully added to the blacklist.
   */
  addToBlackList(token: string, expirationTime: number): Promise<void>;

  /**
   * Checks if the given token is blacklisted.
   *
   * @param {string} token - The token to be checked.
   * @return {Promise<boolean>} A promise that resolves to true if the token is blacklisted false otherwise.
   */
  isBlackListed(token: string): Promise<boolean>;
}
