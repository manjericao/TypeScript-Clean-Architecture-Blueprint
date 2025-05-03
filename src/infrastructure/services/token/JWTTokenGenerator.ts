import { inject, injectable } from 'inversify';
import { sign, verify } from 'jsonwebtoken';

import { IConfig } from '@application/contracts/infrastructure';
import { IJWTTokenGenerator } from '@application/contracts/security/authentication';
import { TokenType } from '@enterprise/enum';
import { Types } from '@interface/types';

@injectable()
export class JWTTokenGenerator implements IJWTTokenGenerator {
  constructor(@inject(Types.Config) private readonly config: IConfig) {}

  generateJWTToken(
    payload: Record<string, unknown>,
    type: TokenType,
    expiresInMinutes: number
  ): string {
    return sign(
      {
        ...payload,
        tokenType: type
      },
      this.config.jwt.secret,
      {
        expiresIn:
          type === TokenType.REFRESH ? expiresInMinutes * 24 * 60 * 60 : expiresInMinutes * 60
      }
    );
  }

  validateJWTToken(
    token: string,
    type: TokenType
  ): Promise<{ valid: boolean; payload?: Record<string, unknown> }> {
    try {
      const decoded = verify(token, this.config.jwt.secret) as Record<string, unknown>;

      if (decoded.tokenType !== type) {
        return Promise.resolve({ valid: false });
      }

      return Promise.resolve({
        valid: true,
        payload: decoded
      });
    } catch {
      return Promise.resolve({ valid: false });
    }
  }
}
