import { IDatabase } from '@application/contracts/infrastructure/database/IDatabase';
import { ILogger } from '@application/contracts/infrastructure/logging/ILogger';
import { IServer } from '@application/contracts/infrastructure/server/IServer';

export class Application {
  constructor(
    private readonly logger: ILogger,
    private readonly databases: IDatabase[],
    private readonly server: IServer
  ) {}

  public async start(): Promise<void> {
    try {
      this.logger.info('Starting application...');

      this.logger.info('Connecting to databases...');
      await Promise.all(this.databases.map(db => db.connect()));
      this.logger.info('Database connections established');

      this.logger.info('Starting server...');
      await this.server.start();
      this.logger.info('Server started successfully');
    } catch (error) {
      this.logger.error('Failed to start application', error as Error);
      throw error;
    }
  }
}
