import { Expose } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

import { BaseDTO } from '@enterprise/dto/input/base';

/**
 * Data Transfer Object (DTO) for user email.
 *
 * This class is used to validate the structure and constraints
 * of user email data transferred between different application layers.
 *
 * Properties:
 * - `email`: A string representing a valid email address.
 *
 * Decorators:
 * - `@Expose()`: Ensures that the property is included when the object is serialized using class-transformer.
 * - `@IsEmail()`: Validates the property to ensure it adheres to a valid email format.
 * - `@IsNotEmpty()`: Ensures the property is not empty.
 */
export class EmailUserDTO extends BaseDTO {
  @Expose()
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  /**
   * Validates the provided data and creates an instance of EmailUserDTO.
   *
   * @param data The data to validate and transform
   * @returns A validated EmailUserDTO instance
   * @throws DTOValidationError if validation fails
   */
  static async validate(data: Record<string, unknown>): Promise<EmailUserDTO> {
    return this.validateData(EmailUserDTO, data);
  }
}
