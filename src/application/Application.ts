import { ILogger, IDatabase, IServer } from '@application/contracts/infrastructure';

/**
 * Application class is responsible for managing the lifecycle of the application,
 * including initializing and starting the necessary parts such as databases and server.
 * It uses a logger to record operational events.
 */
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
      await Promise.all(this.databases.map((db) => db.connect()));
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
