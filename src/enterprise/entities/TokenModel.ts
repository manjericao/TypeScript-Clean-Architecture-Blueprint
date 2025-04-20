import { Expose } from 'class-transformer';
import { IsNotEmpty, IsEnum, IsDate, IsUUID, IsOptional, IsBoolean } from 'class-validator';

import { TokenType } from '@enterprise/enum';

export interface IToken {
  id?: string;
  userId: string;
  token: string;
  type: TokenType;
  expiresAt: Date;
  isRevoked: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Token implements IToken {
  @Expose()
  id?: string;

  @Expose()
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @Expose()
  @IsNotEmpty()
  token!: string;

  @Expose()
  @IsEnum(TokenType)
  type!: TokenType;

  @Expose()
  @IsDate()
  expiresAt!: Date;

  @Expose()
  @IsBoolean()
  isRevoked!: boolean;

  @Expose()
  @IsOptional()
  @IsDate()
  createdAt?: Date;

  @Expose()
  @IsOptional()
  @IsDate()
  updatedAt?: Date;

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isValid(): boolean {
    return !this.isRevoked && !this.isExpired();
  }

  constructor(partial: Partial<Token>) {
    Object.assign(this, partial);
  }
}

/**
 * @openapi
 * components:
 *   schemas:
 *     Token:
 *       type: object
 *       required:
 *         - userId
 *         - token
 *         - type
 *         - expiresAt
 *         - isRevoked
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier for the token.
 *         userId:
 *           type: string
 *           format: uuid
 *           description: ID of the user this token belongs to.
 *         token:
 *           type: string
 *           description: The actual token value.
 *         type:
 *           type: string
 *           enum: [ACCESS, REFRESH, VERIFICATION, RESET_PASSWORD]
 *           description: Type of token.
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: Expiration date and time of the token.
 *         isRevoked:
 *           type: boolean
 *           description: Whether the token has been revoked.
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the token was created.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the token was last updated.
 *       example:
 *         userId: "550e8400-e29b-41d4-a716-446655440000"
 *         token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         type: "ACCESS"
 *         expiresAt: "2023-12-31T23:59:59.999Z"
 *         isRevoked: false
 *         createdAt: "2023-01-01T12:00:00.000Z"
 *         updatedAt: "2023-01-01T12:00:00.000Z"
 */
