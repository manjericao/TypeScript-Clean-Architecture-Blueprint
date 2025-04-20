/**
 * Interface representing a token blacklist service.
 */
export interface ITokenBlackList {
  /**
   * Adds a token to the blocklist with a specified expiration time.
   *
   * @param {string} token - The token to be blocklisted.
   * @param {number} expirationTime - The time in milliseconds after which the token will expire.
   * @return {Promise<void>} A Promise that resolves when the token is successfully added to the blocklist.
   */
  addToBlackList(token: string, expirationTime: number): Promise<void>;

  /**
   * Checks if the given token is blocklisted.
   *
   * @param {string} token - The token to be checked.
   * @return {Promise<boolean>} A promise that resolves to true if the token is blocklisted false otherwise.
   */
  isBlackListed(token: string): Promise<boolean>;
}
