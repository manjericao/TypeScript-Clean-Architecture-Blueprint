import { DTOConversionError } from '@enterprise/dto/errors';
import { Token } from '@enterprise/entities';
import { TokenType } from '@enterprise/enum';

/**
 * Data Transfer Object representing a token entity in response objects.
 * Used for sending token data to clients or between services.
 */
export class TokenResponseDTO {
  /**
   * Unique identifier for the token
   */
  id?: string;

  /**
   * The ID of the user associated with this token
   */
  userId!: string;

  /**
   * The token value
   */
  token!: string;

  /**
   * The type of token (verification, password reset, etc.)
   */
  type!: TokenType;

  /**
   * When this token expires
   */
  expiresAt!: Date;

  /**
   * Whether this token has been revoked
   */
  isRevoked!: boolean;

  /**
   * When the token was created
   */
  createdAt?: Date;

  /**
   * When the token was last updated
   */
  updatedAt?: Date;

  /**
   * Checks if the token has expired
   *
   * @returns True if the token has expired, false otherwise
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Checks if the token is valid (not expired and not revoked)
   *
   * @returns True if the token is valid, false otherwise
   */
  isValid(): boolean {
    return !this.isExpired() && !this.isRevoked;
  }

  /**
   * Factory method to create a TokenResponseDTO from a domain entity or database record
   *
   * @param entity The source entity
   * @returns A new TokenResponseDTO instance
   */
  static fromEntity(entity: unknown): TokenResponseDTO {
    if (!this.isTokenEntity(entity)) {
      throw new DTOConversionError(
        'Invalid token entity provided for conversion to TokenResponseDTO',
        entity
      );
    }

    const dto = new TokenResponseDTO();
    dto.id = entity.id;
    dto.userId = entity.userId;
    dto.token = entity.token;
    dto.type = entity.type;
    dto.expiresAt = entity.expiresAt;
    dto.isRevoked = entity.isRevoked;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  /**
   * Type guard to check if an unknown value is a valid TokenEntity
   *
   * @param value The value to check
   * @returns True if the value is a valid TokenEntity
   */
  private static isTokenEntity(value: unknown): value is Token {
    return (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      'userId' in value &&
      'token' in value &&
      'type' in value &&
      'expiresAt' in value &&
      'isRevoked' in value
    );
  }
}
