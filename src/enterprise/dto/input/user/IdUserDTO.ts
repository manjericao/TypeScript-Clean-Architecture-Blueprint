import { Expose } from 'class-transformer';
import { IsNotEmpty } from 'class-validator';

import { BaseDTO } from '@enterprise/dto/input/base';

/**
 * A Data Transfer Object (DTO) representing a user identified by an ID.
 *
 * This class is used to validate and transfer user-related data,
 * specifically focusing on the `id` property, which is required and must be a non-empty value.
 * It extends the capabilities of the base DTO for additional functionality.
 *
 * Properties are decorated with validation rules to ensure compliance with expected formats and values.
 *
 * Validation is performed using class-validator decorators and other validation hooks.
 *
 * Methods:
 * - `validate()`: Validates the input data and returns an instance of `IdUserDTO`.
 *
 * Extend this DTO to include further attributes as necessary, ensuring other properties are also validated.
 */
export class IdUserDTO extends BaseDTO {
  @Expose()
  @IsNotEmpty({ message: 'Id is required' })
  id!: string;

  /**
   * Validates the provided data and creates an instance of GetAllUsersInputDTO.
   *
   * @param data The data to validate and transform
   * @returns A validated GetAllUsersInputDTO instance
   * @throws DTOValidationError if validation fails
   */
  static async validate(data: Record<string, unknown>): Promise<IdUserDTO> {
    return await this.validateData(IdUserDTO, data);
  }
}
