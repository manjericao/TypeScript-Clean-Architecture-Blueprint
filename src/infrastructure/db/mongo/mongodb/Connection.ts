import { inject, injectable } from 'inversify';
import mongoose from 'mongoose';
import { inspect } from 'util';
import { Types } from '@interface/types';
import { IConfig, IDatabase, ILogger } from '@application/contracts/infrastructure';

@injectable()
export class MongoDBConnection implements IDatabase {
  private readonly connection: mongoose.Connection;

  constructor(
    @inject(Types.Logger) private readonly logger: ILogger,
    @inject(Types.Config) private readonly config: IConfig
  ) {
    this.connection = mongoose.connection;
    this.setupDebug();
    this.setupEventHandlers();
  }

  private setupDebug(): void {
    if (this.config.MONGOOSE_DEBUG) {
      mongoose.set('debug', (collectionName: string, method: string, query: unknown, doc: unknown) => {
        this.logger.info(`${collectionName}.${method}`, inspect(query, false, 20), doc);
      });
    }
  }

  private setupEventHandlers(): void {
    this.connection.on('error', (err: Error) => {
      this.logger.error(`MongoDB connection error: ${err}`);
      process.exit(1);
    });

    this.connection.on('connected', () => {
      this.logger.info(`Mongoose connection established to ${this.config.db}`);
    });

    this.connection.on('disconnected', () => {
      this.logger.info('Mongoose connection disconnected');
    });
  }

  public async connect(): Promise<void> {
    try {
      await mongoose.connect(this.config.db);
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    await mongoose.disconnect();
  }
}
