import { IsNotEmpty, IsString } from 'class-validator';

import { BaseDTO } from '@enterprise/dto/input/base';

export class TokenInputDTO extends BaseDTO {
  /**
   * The verification token received by the user (e.g., via email link).
   * @example 'abc123def456...'
   */
  @IsNotEmpty()
  @IsString()
  token!: string;

  /**
   * Validates the provided data against the TokenInputDTO schema.
   *
   * @param {Record<string, unknown>} data - The data object to be validated.
   * @return {Promise<TokenInputDTO>} A promise that resolves to a TokenInputDTO object if validation succeeds.
   */
  static async validate(data: Record<string, unknown>): Promise<TokenInputDTO> {
    return this.validateData(TokenInputDTO, data);
  }
}
