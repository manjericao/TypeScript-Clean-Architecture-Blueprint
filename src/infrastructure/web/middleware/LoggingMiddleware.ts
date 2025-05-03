import express from 'express';
import { inject, injectable } from 'inversify';
import morgan, { StreamOptions } from 'morgan';

import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IExpressMiddleware } from '@infrastructure/web/middleware/IExpressMiddleware';
import { Types } from '@interface/types';

@injectable()
export class LoggingMiddleware implements IExpressMiddleware {
  constructor(
    @inject(Types.Logger) private readonly logger: ILogger,
    @inject(Types.Config) private readonly config: IConfig
  ) {}

  public handle(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const stream: StreamOptions = {
      write: (message: string) => this.logger.info(message.trim())
    };

    const morganMiddleware = morgan(this.getMorganFormat(), {
      stream,
      skip: () => this.config.env === 'test'
    });

    morganMiddleware(req, res, next);
  }

  public asMiddleware(): express.RequestHandler {
    return (req, res, next) => this.handle(req, res, next);
  }

  private getMorganFormat(): string {
    return this.config.env === 'development'
      ? 'dev'
      : ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms';
  }
}
