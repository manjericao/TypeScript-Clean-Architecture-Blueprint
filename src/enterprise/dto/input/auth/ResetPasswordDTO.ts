import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { BaseDTO } from '@enterprise/dto/input/base';

/**
 * Data Transfer Object (DTO) representing the necessary data required to reset a user's password.
 *
 * This class is typically used to encapsulate and validate the information provided during
 * a password reset operation.
 */
export class ResetPasswordDTO extends BaseDTO {
  @Expose()
  @IsString({ message: 'Token must be a string' })
  @IsNotEmpty({ message: 'Token is required' })
  token!: string;

  @Expose()
  @IsString({ message: 'New password must be a string' })
  @IsNotEmpty({ message: 'New password is required' })
  @Length(8, 100, { message: 'Password must be between 8 and 100 characters' })
  newPassword!: string;

  /**
   * Validates the provided data and creates an instance of ResetPasswordDTO.
   *
   * @param data The data to validate and transform
   * @returns A validated ResetPasswordDTO instance
   * @throws DTOValidationError if validation fails
   */
  static async validate(data: Record<string, unknown>): Promise<ResetPasswordDTO> {
    return this.validateData(ResetPasswordDTO, data);
  }
}
