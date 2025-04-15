import express, { Express } from 'express';
import { Server as HttpServer } from 'http';
import { IConfig, ILogger, IServer } from '@application/contracts/infrastructure';
import { IAuthMiddleware } from '@infrastructure/web/middleware';

export class Server implements IServer{
  private config: IConfig;
  private logger: ILogger;
  public express: Express;
  private auth: IAuthMiddleware;

  constructor({ config, router, logger, auth }: { config: IConfig; router: express.Router; logger: ILogger; auth: IAuthMiddleware }) {
    this.config = config;
    this.logger = logger;
    this.auth = auth;
    this.express = express();

    this.express.disable('x-powered-by');
    this.express.use(this.auth.initialize());
    this.express.use(router);
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      const server: HttpServer = this.express.listen(this.config.server.port, this.config.server.host, () => {
        const { port } = server.address() as { address: string; family: string; port: number };
        this.logger.info(`[p ${process.pid}] Listening at port ${port}`);
        resolve();
      });
    });
  }
}
