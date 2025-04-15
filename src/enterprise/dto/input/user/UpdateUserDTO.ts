import { Expose, Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, Matches, IsBoolean } from 'class-validator';
import { UserRole, Gender } from '@enterprise/enum';
import { BaseDTO } from '@enterprise/dto/input/base';

/**
 * UpdateUserDTO is an input data transfer object used for validating and transforming
 * user update data. It extends BaseDTO to leverage its validation capabilities.
 *
 * This DTO supports partial updates - all fields are optional, allowing clients to
 * update only specific user properties without providing all user information.
 */
export class UpdateUserDTO extends BaseDTO {
  @Expose()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9 ]+$/, {
    message: 'Name must contain only alphanumeric characters and spaces'
  })
  name?: string;

  @Expose()
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string;

  @Expose()
  @IsOptional()
  username?: string;

  @Expose()
  @IsOptional()
  @Matches(
    /^(?=.*\d)(?=.*[A-Z])(?=.*[a-z])(?=.*[!@#$%^&*])[\w!@#$%^&*]{8,}$/,
    {
      message: 'Password must be at least 8 characters and include uppercase, lowercase, number and special character'
    }
  )
  password?: string;

  @Expose()
  @IsOptional()
  @IsEnum(UserRole, { message: 'Invalid user role' })
  role?: UserRole;

  @Expose()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    if (value instanceof Date) return value;

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? undefined : date;
    }

    return undefined;
  })
  birthDate?: Date;

  @Expose()
  @IsOptional()
  @IsEnum(Gender, { message: 'Invalid gender value' })
  gender?: Gender;

  @Expose()
  @IsOptional()
  @IsBoolean({ message: 'Verification status must be a boolean' })
  isVerified?: boolean;

  /**
   * Validates the provided data and creates an instance of UpdateUserDTO.
   *
   * @param data The data to validate and transform
   * @returns A validated UpdateUserDTO instance
   * @throws DTOValidationError if validation fails
   */
  static async validate(data: Record<string, unknown>): Promise<UpdateUserDTO> {
    return this.validateData(UpdateUserDTO, data);
  }
}
