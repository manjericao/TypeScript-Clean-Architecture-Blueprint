import { Expose, Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, Matches } from 'class-validator';

import { DTOValidationError } from '@enterprise/dto/errors';
import { BaseDTO } from '@enterprise/dto/input/base';
import { UserRole, Gender } from '@enterprise/enum';

/**
 * CreateUserDTO is a data transfer object used to handle user creation.
 * It validates and transforms the input data for user registration processes.
 * This class extends BaseDTO, providing additional validation and transformation capabilities.
 *
 * Properties:
 * - `name`: User's name. Must be alphanumeric and cannot be empty.
 * - `email`: User's email address. Must be in valid email format.
 * - `username`: User's username. Cannot be empty.
 * - `password`: User's password. Must meet complexity requirements.
 * - `repeatPassword`: Password confirmation. Must match password.
 * - `role`: User's role in the system. Must be a valid UserRole.
 * - `birthDate`: Optional. User's birthdate.
 * - `gender`: Optional. User's gender. Must be a valid Gender enum value.
 *
 * Methods:
 * - `validate(data: Record<string, unknown>): Promise<CreateUserDTO>`:
 *   Validates the provided data against the constraints defined in the class.
 *   If validation passes, it returns an instance of CreateUserDTO.
 *   If validation fails, it throws a DTOValidationError.
 */
export class CreateUserDTO extends BaseDTO {
  @Expose()
  @IsNotEmpty({ message: 'Name is required' })
  @Matches(/^[a-zA-Z0-9]+$/, { message: 'Name must be alphanumeric' })
  name!: string;

  @Expose()
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @Expose()
  @IsNotEmpty({ message: 'Username is required' })
  username!: string;

  @Expose()
  @IsNotEmpty({ message: 'Password is required' })
  @Matches(/^(?=.*\d)(?=.*[A-Z])(?=.*[a-z])(?=.*[!@#$%^&*])[\w!@#$%^&*]{8,}$/, {
    message: 'Password must meet complexity requirements'
  })
  password!: string;

  @Expose()
  @IsNotEmpty({ message: 'Password confirmation is required' })
  repeatPassword!: string; // Changed from snake_case to camelCase

  @Expose()
  @IsEnum(UserRole, { message: 'Invalid user role' })
  @IsNotEmpty({ message: 'Role is required' })
  role!: UserRole;

  @Expose()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;

    // Check if it's already a Date object
    if (value instanceof Date) return value;

    // Check if it's a valid string or number that can be converted to a date
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      // Validate that the date is valid before returning
      return isNaN(date.getTime()) ? undefined : date;
    }

    return undefined;
  })
  birthDate?: Date;

  @Expose()
  @IsOptional()
  @IsEnum(Gender, { message: 'Invalid gender value' })
  gender?: Gender;

  /**
   * Validates the provided data and creates an instance of CreateUserDTO.
   * Also check if the password and repeatPassword match.
   *
   * @param data The data to validate and transform
   * @returns A validated CreateUserDTO instance
   * @throws DTOValidationError if validation fails
   */
  static async validate(data: Record<string, unknown>): Promise<CreateUserDTO> {
    const dto = await this.validateData(CreateUserDTO, data);

    if (dto.password !== dto.repeatPassword) {
      const { ValidationError } = await import('class-validator');
      const passwordError = new ValidationError();
      passwordError.property = 'repeatPassword';
      passwordError.constraints = { matches: 'Passwords do not match' };

      throw new DTOValidationError([passwordError]);
    }

    return dto;
  }
}
