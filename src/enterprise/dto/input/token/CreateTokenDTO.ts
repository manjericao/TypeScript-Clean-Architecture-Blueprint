import { Expose, Transform, Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsUUID, IsBoolean, IsDate, ValidateIf } from 'class-validator';

import { BaseDTO } from '@enterprise/dto/input/base';
import { TokenType } from '@enterprise/enum';

/**
 * Data Transfer Object (DTO) for creating a token.
 * This class is used to encapsulate and validate input data when creating a token.
 */
export class CreateTokenDTO extends BaseDTO {
  @Expose()
  @IsUUID('4', { message: 'User ID must be a valid UUID' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  @Expose()
  @IsNotEmpty({ message: 'Token is required' })
  token!: string;

  @Expose()
  @IsEnum(TokenType, { message: 'Invalid token type' })
  @IsNotEmpty({ message: 'Token type is required' })
  type!: TokenType;

  @Expose()
  @IsNotEmpty({ message: 'Expiration date is required' })
  @Type(() => Date)
  @IsDate({ message: 'Expiration date must be a valid date' })
  @ValidateIf((o: CreateTokenDTO) => o.expiresAt !== undefined)
  expiresAt!: Date;

  @Expose()
  @IsBoolean({ message: 'isRevoked must be a boolean value' })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false;
    return value === true || value === 'true';
  })
  isRevoked: boolean = false;

  /**
   * Validates the input data against the DTO schema
   * @param data - The data to validate
   * @returns A validated CreateTokenDTO instance
   */
  static async validate(data: Record<string, unknown>): Promise<CreateTokenDTO> {
    return this.validateData(CreateTokenDTO, data);
  }
}
