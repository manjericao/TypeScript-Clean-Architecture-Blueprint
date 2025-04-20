import { Expose, Type } from 'class-transformer';
import { IsEnum, IsBoolean, IsDate, IsUUID, IsOptional, ValidateIf } from 'class-validator';

import { BaseDTO } from '@enterprise/dto/input/base';
import { TokenType } from '@enterprise/enum';

/**
 * Data Transfer Object for updating token entities.
 * Used in PATCH operations to modify one or more fields of an existing token.
 */
export class UpdateTokenDTO extends BaseDTO {
  @Expose()
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId?: string;

  @Expose()
  @IsOptional()
  token?: string;

  @Expose()
  @IsOptional()
  @IsEnum(TokenType, { message: 'type must be a valid TokenType' })
  type?: TokenType;

  @Expose()
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'expiresAt must be a valid date' })
  @ValidateIf((o: UpdateTokenDTO) => o.expiresAt !== undefined)
  expiresAt?: Date;

  @Expose()
  @IsOptional()
  @IsBoolean({ message: 'isRevoked must be a boolean value' })
  isRevoked?: boolean;

  @ValidateIf(() => true) // This will always run
  hasAtLeastOneField(): boolean {
    return Object.keys(this).some((key) => this[key as keyof UpdateTokenDTO] !== undefined);
  }

  /**
   * Validates the input data against the DTO schema
   * @param data - The data to validate
   * @returns A validated UpdateTokenDTO instance
   */
  static async validate(data: Record<string, unknown>): Promise<UpdateTokenDTO> {
    return this.validateData(UpdateTokenDTO, data);
  }
}
