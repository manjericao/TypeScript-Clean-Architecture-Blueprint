import { TokenType } from '@enterprise/enum';

/**
 * Interface representing a JSON Web Token (JWT) generator and validator.
 */
export interface IJWTTokenGenerator {
  /**
   * Generates a JSON Web Token (JWT) based on the provided payload, token type, and expiration time.
   *
   * @param {Record<string, unknown>} payload - The data to encode within the token.
   * @param {TokenType} type - The type of the token being created (e.g., access or refresh token).
   * @param {number} expiresInMinutes - The expiration time of the token in minutes.
   * @return {string} The generated JWT as a string.
   */
  generateJWTToken(payload: Record<string, unknown>, type: TokenType, expiresInMinutes: number): string;

  /**
   * Validates a given JSON Web Token (JWT) based on its type.
   *
   * @param {string} token - The JSON Web Token string to be validated.
   * @param {TokenType} type - The type of the token to be validated (e.g., access, refresh).
   * @return {Promise<{ valid: boolean; payload?: Record<string, unknown> }>} A promise that resolves to an object indicating whether the token is valid,
   * and an optional payload if the token is valid.
   */
  validateJWTToken(token: string, type: TokenType): Promise<{ valid: boolean; payload?: Record<string, unknown> }>;
}
