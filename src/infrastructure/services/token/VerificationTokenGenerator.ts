import { createHash, randomBytes } from 'crypto';

import { inject, injectable } from 'inversify';

import { IConfig } from '@application/contracts/infrastructure';
import { ITokenGenerator } from '@application/contracts/security/authentication';
import { TokenType } from '@enterprise/enum';
import { Types } from '@interface/types';

@injectable()
export class VerificationTokenGenerator implements ITokenGenerator {
  constructor(@inject(Types.Config) private readonly config: IConfig) {}

  generateToken(
    type: TokenType,
    expiresIn: number = 24 * 60 * 60, // 24 hours by default
    payload: Record<string, unknown> = {}
  ): string {
    if (type !== TokenType.VERIFICATION) {
      throw new Error('This generator only supports verification tokens');
    }

    const timestamp = Date.now() + expiresIn * 1000;

    const randomString = randomBytes(32).toString('hex');

    const payloadString = Object.entries(payload)
      .map(([key, value]) => `${key}:${this.formatValue(value)}`)
      .join('|');

    const baseString = `${randomString}|${timestamp}|${payloadString}|${this.config.jwt.secret}`;

    const hash = createHash('sha256').update(baseString).digest('hex');

    return Buffer.from(
      JSON.stringify({
        t: timestamp,
        h: hash,
        p: this.formatValue(payload.userId) // Include userId for verification
      })
    ).toString('base64url');
  }

  validateToken(
    _token: string,
    type: TokenType
  ): Promise<{ valid: boolean; payload?: Record<string, unknown> }> {
    if (type !== TokenType.VERIFICATION) {
      return Promise.resolve({ valid: false });
    }

    // This method should not perform actual validation
    // The service layer should handle database checks and user verification
    return Promise.resolve({ valid: false });
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value.toString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return JSON.stringify(value);
  }
}
