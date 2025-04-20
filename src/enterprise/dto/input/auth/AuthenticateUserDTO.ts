import { Expose } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

import { BaseDTO } from '@enterprise/dto/input/base';

/**
 * AuthenticateUserDTO is a data transfer object used to handle user authentication.
 * It validates and transforms the input data for authentication processes.
 * This class extends BaseDTO, providing additional validation and transformation capabilities.
 *
 * Properties:
 * - `email`: Represents the user's email address. The email must be in the correct format and cannot be empty.
 * - `password`: Represents the user's password. The password field cannot be empty.
 *
 * Methods:
 * - `validate(data: Record<string, unknown>): Promise<AuthenticateUserDTO>`:
 *   Validates the provided data against the constraints defined in the class.
 *   If validation passes, it returns an instance of AuthenticateUserDTO.
 *   If validation fails, it throws a DTOValidationError.
 */
export class AuthenticateUserDTO extends BaseDTO {
  @Expose()
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @Expose()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;

  /**
   * Validates the provided data and creates an instance of AuthenticateUserDTO.
   *
   * @param data The data to validate and transform
   * @returns A validated AuthenticateUserDTO instance
   * @throws DTOValidationError if validation fails
   */
  static async validate(data: Record<string, unknown>): Promise<AuthenticateUserDTO> {
    return this.validateData(AuthenticateUserDTO, data);
  }
}
