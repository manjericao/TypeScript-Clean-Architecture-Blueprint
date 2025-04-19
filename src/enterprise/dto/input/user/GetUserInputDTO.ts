import { Expose, Transform } from 'class-transformer';
import { IsOptional, IsString, IsNotEmpty, ValidateIf } from 'class-validator';

import { BaseDTO } from '@enterprise/dto/input/base'; // Assuming BaseDTO exists for validation logic

/**
 * Represents a Data Transfer Object (DTO) for retrieving user input.
 * This class ensures validation and transformation of input data.
 * The input must include either an `id` or `email`, but not necessarily both.
 */
export class GetUserInputDTO extends BaseDTO {
  @Expose()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'ID must not be empty if provided and email is missing' })
  @ValidateIf((o: GetUserInputDTO) => o.email === undefined || o.email === null || o.email === '')
  @Transform(({ value }: { value: unknown }) => (value || undefined) as string | undefined)
  id?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Email must not be empty if provided and ID is missing' })
  @ValidateIf((o: GetUserInputDTO) => o.id === undefined || o.id === null || o.id === '')
  @Transform(({ value }: { value: unknown }) => (value || undefined) as string | undefined)
  email?: string;

  /**
   * Validates the provided data and creates an instance of GetUserInputDTO.
   * Ensures that either 'id' or 'email' is provided.
   *
   * @param data The data to validate and transform
   * @returns A validated GetUserInputDTO instance
   * @throws DTOValidationError if validation fails or if neither id nor email is present
   */
  static async validate(data: Record<string, unknown>): Promise<GetUserInputDTO> {
    const dto = await super.validateData(GetUserInputDTO, data);

    if (!dto.id && !dto.email) {
      throw new Error('Either user ID or email must be provided and valid.');
    }
    return dto;
  }
}
