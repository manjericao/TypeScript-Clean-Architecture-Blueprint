import { TokenType } from '@enterprise/enum';

/**
 * Interface for token generation service.
 * Implementations can use any library or method to generate tokens.
 */
export interface ITokenGenerator {
  /**
   * Generates a token string of the specified type with an optional payload.
   *
   * @param {TokenType} type - The type of token to generate (ACCESS, REFRESH, VERIFICATION, etc.)
   * @param {Record<string, any>} payload - Optional payload to include in the token
   * @param {number} [expiresIn] - Optional expiration time in seconds
   * @returns {string} The generated token string
   */
  generateToken(type: TokenType, expiresIn?: number, payload?: Record<string, unknown>): string;

  /**
   * Validates a given token based on the specified token type.
   *
   * @param {string} token - The token to validate.
   * @param {TokenType} type - The type of the token to determine validation rules.
   * @return {Promise<{ valid: boolean; payload?: Record<string, unknown> }>} A promise that resolves to an object indicating whether the token is valid
   * and optionally includes decoded payload data if validation is successful.
   */
  validateToken(
    token: string,
    type: TokenType
  ): Promise<{ valid: boolean; payload?: Record<string, unknown> }>;
}
