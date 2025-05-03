import express, { Request, Response, NextFunction } from 'express';
import status from 'http-status';
import { inject, injectable } from 'inversify';

import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IExpressMiddleware } from '@infrastructure/web/middleware/IExpressMiddleware';
import { Types } from '@interface/types';

@injectable()
export class ErrorMiddleware implements IExpressMiddleware {
  constructor(
    @inject(Types.Logger) private readonly logger: ILogger,
    @inject(Types.Config) private readonly config: IConfig
  ) {}

  public handle(
    first: Error,
    _second: Request,
    third: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _fourth: NextFunction
  ): void {
    this.logger.error(first.message);

    const response = {
      type: 'InternalServerError',
      ...(this.config.env === 'development' && {
        message: first.message,
        stack: first.stack
      })
    };

    third.status(status.INTERNAL_SERVER_ERROR).json(response);
  }

  public asMiddleware(): express.ErrorRequestHandler {
    return (err: Error, req: Request, res: Response, next: NextFunction) =>
      this.handle(err, req, res, next);
  }
}
