import { Expose } from 'class-transformer';
import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';

import { BaseDTO } from '@enterprise/dto/input/base';

/**
 * GetAllUsersInputDTO is a data transfer object used to handle pagination parameters
 * for retrieving users. It validates and transforms the input data for user listing processes.
 * This class extends BaseDTO, providing additional validation and transformation capabilities.
 *
 * Properties:
 * - `page`: Page number for pagination. Must be a positive integer.
 * - `limit`: Number of items per page. Must be between 1 and 100.
 *
 * Methods:
 * - `validate(data: Record<string, unknown>): Promise<GetAllUsersInputDTO>`:
 *   Validates the provided data against the constraints defined in the class.
 *   If validation passes, it returns an instance of GetAllUsersInputDTO.
 *   If validation fails, it throws a DTOValidationError.
 */
export class GetAllUsersInputDTO extends BaseDTO {
  @Expose()
  @IsNotEmpty({ message: 'Page number is required' })
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be greater than or equal to 1' })
  page!: number;

  @Expose()
  @IsNotEmpty({ message: 'Limit is required' })
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be greater than or equal to 1' })
  @Max(100, { message: 'Limit must be less than or equal to 100' })
  limit!: number;

  /**
   * Validates the provided data and creates an instance of GetAllUsersInputDTO.
   *
   * @param data The data to validate and transform
   * @returns A validated GetAllUsersInputDTO instance
   * @throws DTOValidationError if validation fails
   */
  static async validate(data: Record<string, unknown>): Promise<GetAllUsersInputDTO> {
    return await this.validateData(GetAllUsersInputDTO, data);
  }
}
