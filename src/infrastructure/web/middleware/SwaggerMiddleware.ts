import express, { Router } from 'express';
import { injectable, inject } from 'inversify';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import { SwaggerOptionsProvider } from '@infrastructure/web/docs';
import { IExpressMiddleware } from '@infrastructure/web/middleware/IExpressMiddleware';
import { Types } from '@interface/types';

@injectable()
export class SwaggerMiddleware implements IExpressMiddleware {
  constructor(
    @inject(Types.SwaggerOptionsProvider) private swaggerOptionsProvider: SwaggerOptionsProvider
  ) {}

  public async handle(
    request: express.Request,
    response: express.Response,
    next: express.NextFunction
  ): Promise<void> {
    const formatError = (err: unknown): Error => {
      if (err instanceof Error) return err;
      if (typeof err === 'string') return new Error(err);
      return new Error(JSON.stringify(err, null, 2));
    };

    try {
      const docs = this.swaggerOptionsProvider.getSwaggerOptions();
      const swaggerUiMiddleware = swaggerUi.setup(swaggerJsdoc(docs), { explorer: true });
      return await new Promise<void>((resolve, reject) => {
        const result = swaggerUiMiddleware(request, response, (err: unknown) => {
          if (err) {
            reject(formatError(err));
          } else {
            resolve();
          }
        });

        // Handle if middleware returns a promise
        if (result && typeof result.then === 'function') {
          void result.catch((err: unknown) => reject(formatError(err)));
        }
      });
    } catch (error) {
      const errorToThrow = formatError(error);
      next(errorToThrow);
      throw errorToThrow;
    }
  }

  public asMiddleware(): express.RequestHandler {
    return (request: express.Request, response: express.Response, next: express.NextFunction) =>
      void this.handle(request, response, next).catch(next);
  }

  public getRouter(): Router {
    const router = Router();
    router.use('/', swaggerUi.serve);
    router.get('/', this.asMiddleware());
    return router;
  }
}
