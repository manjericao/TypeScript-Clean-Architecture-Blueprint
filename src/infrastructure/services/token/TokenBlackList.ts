import { inject, injectable } from 'inversify';
import { Redis } from 'ioredis';
import { Types } from '@interface/types';
import { RedisConnection } from '@infrastructure/db/redis/redisdb';
import { ITokenBlackList } from '@application/contracts/security/authentication';
import { ILogger } from '@application/contracts/infrastructure';


@injectable()
export class TokenBlackList implements ITokenBlackList {
  private readonly BLACKLIST_PREFIX = 'token:blacklist:';
  private redisClient: Redis;

  constructor(
    @inject(Types.RedisConnection) redisConnection: RedisConnection,
    @inject(Types.Logger) private readonly logger: ILogger
  ) {
    // Cast the database connection to Redis client
    this.redisClient = redisConnection.getClient();
  }

  /**
   * Adds a token to the blacklist with a specified expiration time.
   *
   * @param {string} token - The token to be blacklisted
   * @param {number} expirationTime - Time in minutes for token expiration
   */
  async addToBlackList(token: string, expirationTime: number): Promise<void> {
    try {
      const key = this.getBlacklistKey(token);
      // Convert minutes to seconds for Redis
      const expirationSeconds = expirationTime * 60;

      // Store token in Redis with expiration
      await this.redisClient.setex(key, expirationSeconds, 'blacklisted');

      this.logger.info(`Token successfully blacklisted with expiration of ${expirationTime} minutes`);
    } catch (error) {
      this.logger.error('Error adding token to blacklist:', error);
      throw new Error('Failed to blacklist token');
    }
  }

  /**
   * Checks if a token is blacklisted
   *
   * @param {string} token - The token to check
   * @returns {Promise<boolean>} - True if token is blacklisted, false otherwise
   */
  async isBlackListed(token: string): Promise<boolean> {
    try {
      const key = this.getBlacklistKey(token);
      const exists = await this.redisClient.exists(key);

      return exists === 1;
    } catch (error) {
      this.logger.error('Error checking token blacklist status:', error);
      throw new Error('Failed to check token blacklist status');
    }
  }

  /**
   * Generates a Redis key for the blacklisted token
   *
   * @private
   * @param {string} token - The token to generate a key for
   * @returns {string} - The generated Redis key
   */
  private getBlacklistKey(token: string): string {
    return `${this.BLACKLIST_PREFIX}${token}`;
  }
}
