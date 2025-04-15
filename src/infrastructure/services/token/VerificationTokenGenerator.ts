import { inject, injectable } from 'inversify';
import { TokenType } from '@enterprise/enum';
import { createHash, randomBytes } from 'crypto';
import { Types } from '@interface/types';
import { ITokenGenerator } from '@application/contracts/security/authentication';
import { IConfig } from '@application/contracts/infrastructure';

@injectable()
export class VerificationTokenGenerator implements ITokenGenerator {
  constructor(
    @inject(Types.Config) private readonly config: IConfig
  ) {
  }

  generateToken(
    type: TokenType,
    expiresIn: number = 24 * 60 * 60, // 24 hours by default
    payload: Record<string, unknown> = {}
  ): string {
    if (type !== TokenType.VERIFICATION) {
      throw new Error('This generator only supports verification tokens');
    }

    // Create a timestamp that will be used for expiration
    const timestamp = Date.now() + (expiresIn * 1000);

    // Generate random bytes for uniqueness
    const randomString = randomBytes(32).toString('hex');

    // Combine payload data into a string with type checking
    const payloadString = Object.entries(payload)
      .map(([key, value]) => `${key}:${this.formatValue(value)}`)
      .join('|');

    // Create the base string to hash
    const baseString = `${randomString}|${timestamp}|${payloadString}|${this.config.jwt.secret}`;

    // Create hash of the base string
    const hash = createHash('sha256')
      .update(baseString)
      .digest('hex');

    // Combine timestamp, payload identifier and hash into the final token
    return Buffer.from(
      JSON.stringify({
        t: timestamp,
        h: hash,
        p: this.formatValue(payload.userId) // Include userId for verification
      })
    ).toString('base64url');
  }

  validateToken(
    token: string,
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
