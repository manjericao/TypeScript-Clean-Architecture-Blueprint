import { inject, injectable } from 'inversify';
import Redis, { RedisOptions } from 'ioredis';
import { Types } from '@interface/types';
import { IConfig, IDatabase, ILogger } from '@application/contracts/infrastructure';

interface RedisClient extends Redis {
  ping(): Promise<'PONG'>;
  quit(): Promise<'OK'>;
}

type RedisEvents = {
  on(event: 'error', listener: (error: Error) => void): Redis  ;
  on(event: 'connect' | 'ready' | 'close' | 'reconnecting', listener: () => void): Redis;
};

@injectable()
export class RedisConnection implements IDatabase {
  private readonly client: RedisClient;

  constructor(
    @inject(Types.Logger) private readonly logger: ILogger,
    @inject(Types.Config) private readonly config: IConfig
  ) {
    const redisOptions: RedisOptions = {
      host: this.config.redis.host || 'localhost',
      port: this.config.redis.port || 6379,
      password: this.config.redis.password,
      retryStrategy: (times: number) => {
        return Math.min(times * 50, 2000);
      }
    };


    this.client = new Redis(redisOptions) as RedisClient;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    (this.client as RedisEvents).on('error', (err: Error) => {
      this.logger.error(`Redis connection error: ${err}`);
      process.exit(1);
    });

    (this.client as RedisEvents).on('connect', () => {
      this.logger.info(`Redis connection established to ${this.config.redis.host}:${this.config.redis.port}`);
    });

    (this.client as RedisEvents).on('ready', () => {
      this.logger.info('Redis client ready');
    });

    (this.client as RedisEvents).on('close', () => {
      this.logger.info('Redis connection closed');
    });

    (this.client as RedisEvents).on('reconnecting', () => {
      this.logger.info('Redis client reconnecting');
    });
  }

  public async connect(): Promise<void> {
    try {
      await this.client.ping();
      this.logger.info('Redis connection test successful');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.info('Redis connection closed gracefully');
    } catch (error) {
      this.logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  public getClient(): RedisClient {
    return this.client;
  }
}
