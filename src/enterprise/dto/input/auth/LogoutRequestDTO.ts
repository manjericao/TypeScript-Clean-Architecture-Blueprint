import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

import { BaseDTO } from '@enterprise/dto/input/base';

/**
 * Data Transfer Object for user logout requests.
 *
 * This class validates the structure and presence of tokens required
 * for securely logging out a user and invalidating their authentication tokens.
 */
export class LogoutRequestDTO extends BaseDTO {
  @Expose()
  @IsString({ message: 'Access token must be a string' })
  @IsNotEmpty({ message: 'Access token is required' })
  @Matches(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/, {
    message: 'Invalid access token format'
  })
  accessToken!: string;

  @Expose()
  @IsString({ message: 'Refresh token must be a string' })
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken!: string;

  /**
   * Validates the provided data and creates an instance of LogoutRequestDTO.
   *
   * @param data The data to validate and transform
   * @returns A validated LogoutRequestDTO instance
   * @throws DTOValidationError if validation fails
   */
  static async validate(data: Record<string, unknown>): Promise<LogoutRequestDTO> {
    return this.validateData(LogoutRequestDTO, data);
  }
}
