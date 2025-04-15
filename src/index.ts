import 'reflect-metadata';
import 'module-alias/register';
import * as dotenvSafe from 'dotenv-safe';
import path from 'path';
import { container, runBootstrappers } from '@infrastructure/ioc';
import { Application } from '@application/Application';
import { RouterFactory, Server } from '@infrastructure/web';
import { Types } from '@interface/types';
import { envSchema, EnvVars } from '@infrastructure/config';
import { IConfig, IDatabase, ILogger } from '@application/contracts/infrastructure';
import { IAuthMiddleware } from '@infrastructure/web/middleware';

/**
 * Class responsible for bootstrapping and initializing the application.
 * It handles configuration loading, environment setup, process signal handling,
 * and application startup.
 *
 * @class ApplicationBootstrap
 */
class ApplicationBootstrap {
  private readonly logger: ILogger;
  private readonly config: IConfig;
  private readonly env: EnvVars = this.initializeEnv();

  constructor() {
    this.logger = container.get<ILogger>(Types.Logger);
    this.config = container.get<IConfig>(Types.Config);
  }

  private initializeEnv(): EnvVars {
    try {
      dotenvSafe.config({
        allowEmptyValues: true,
        example: path.join(__dirname, '../.env.example'),
        path: path.join(__dirname, '../.env'),
      });

      const parseResult = envSchema.safeParse(process.env);

      if (!parseResult.success) {
        console.error('❌ Invalid environment variables:');
        console.error(parseResult.error.format());
        process.exit(1);
      }

      return parseResult.data;
    } catch (error) {
      console.error('❌ Error loading environment variables:', error);
      process.exit(1);
    }
  }

  private setupProcessHandlers(): void {
    const handleExit = async (signal: string) => {
      this.logger.info(`${signal} received. Starting graceful shutdown...`);

      try {
        const mongoDatabase = container.get<IDatabase>(Types.Database);
        const redisDatabase = container.get<IDatabase>(Types.RedisConnection);

        await Promise.all([
          mongoDatabase.disconnect(),
          redisDatabase.disconnect()
        ]);

        this.logger.info('Cleanup complete, shutting down.');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    const handleError = (error: unknown, source: string): void => {
      if (error instanceof Error) {
        this.logger.error(`${source}:`, error);
      } else {
        this.logger.error(`${source}: Unknown error`, { error });
      }
      process.exit(1);
    };

    // Process handlers
    process.on('SIGTERM', () => {
      handleExit('SIGTERM').catch(err => {
        this.logger.error('Error in SIGTERM handler:', err);
        process.exit(1);
      });
    });
    process.on('SIGINT', () => {
      handleExit('SIGINT').catch(err => {
        this.logger.error('Error in SIGINT handler:', err);
        process.exit(1);
      });
    });
    process.on('uncaughtException', (error) => handleError(error, 'Uncaught Exception'));
    process.on('unhandledRejection', (error: unknown) => handleError(error, 'Unhandled Rejection'));
  }

  private createServer(): Server {
    const routerFactory = container.get<RouterFactory>(Types.RouterFactory);
    const auth = container.get<IAuthMiddleware>(Types.AuthMiddleware);

    const router = routerFactory.createRouter();

    return new Server({
      config: this.config,
      router,
      logger: this.logger,
      auth
    });
  }

  public async start(): Promise<void> {
    try {
      this.setupProcessHandlers();

      await runBootstrappers();

      const mongoDatabase = container.get<IDatabase>(Types.Database);
      const redisDatabase = container.get<IDatabase>(Types.RedisConnection);
      const databases = [mongoDatabase, redisDatabase];

      const server = this.createServer();

      const application = new Application(
        this.logger,
        databases,
        server,
      );

      await application.start();

      this.logger.info(
        `✨ Application started successfully in ${this.env.NODE_ENV} mode on ${this.config.server.protocol}://${this.config.server.host}:${this.env.PORT}`
      );

      // Log important configuration details in development mode
      if (this.env.NODE_ENV === 'development') {
        this.logger.debug('Environment Configuration:', {
          nodeEnv: this.env.NODE_ENV,
          port: this.env.PORT,
          mongoDbUrl: this.env.MONGODB_URL,
          storageType: this.env.STORAGE_TYPE,
          mongooseDebug: this.env.MONGOOSE_DEBUG,
        });
      }
    } catch (error) {
      this.logger.error('Failed to start application:', error as Error);
      process.exit(1);
    }
  }
}

/**
 * bootstrapApplication is an asynchronous function responsible for initializing
 * and starting the application. This function creates a new instance of the
 * ApplicationBootstrap class and invokes its start method to perform the
 * bootstrap process.
 *
 * If an error occurs during the bootstrap process, it logs the error to the console
 * and terminates the process with a non-zero exit code.
 *
 * This function should be called to prepare the application before it begins
 * handling requests or other activities.
 *
 * Note: Ensure that the ApplicationBootstrap class and its start method are
 * correctly implemented and handle all necessary initialization steps.
 *
 * @function
 * @async
 */
const bootstrapApplication = async () => {
  try {
    const bootstrap = new ApplicationBootstrap();
    await bootstrap.start();
  } catch (error) {
    console.error('Fatal error during bootstrap:', error);
    process.exit(1);
  }
};

// Start the application
bootstrapApplication().catch((error) => {
  console.error('Fatal error during bootstrap:', error);
});
