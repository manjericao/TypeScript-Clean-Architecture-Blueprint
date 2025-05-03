import path from 'path';

import compress from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import actuator from 'express-actuator';
import { rateLimit } from 'express-rate-limit';
import statusMonitor from 'express-status-monitor';
import helmet from 'helmet';
import hpp from 'hpp';
import { injectable, inject } from 'inversify';
import { register } from 'prom-client';
import favicon from 'serve-favicon';
import xss from 'xss-clean';

import { IConfig, ILogger } from '@application/contracts/infrastructure';
import {
  LoggingMiddleware,
  SwaggerMiddleware,
  AuthMiddleware,
  ErrorMiddleware
} from '@infrastructure/web/middleware';
import { UserModule, AuthModule } from '@infrastructure/web/routes';
import { Types } from '@interface/types';

@injectable()
export class RouterFactory {
  constructor(
    @inject(Types.Config) private readonly config: IConfig,
    @inject(Types.Logger) private readonly logger: ILogger,
    @inject(Types.SwaggerMiddleware) private readonly swaggerMiddleware: SwaggerMiddleware,
    @inject(Types.AuthMiddleware) private readonly authMiddleware: AuthMiddleware,
    @inject(Types.LoggingMiddleware) private readonly loggingMiddleware: LoggingMiddleware,
    @inject(Types.ErrorMiddleware) private readonly errorMiddleware: ErrorMiddleware,
    @inject(Types.UserModule) private readonly userModule: UserModule,
    @inject(Types.AuthModule) private readonly authModule: AuthModule
  ) {}

  public createRouter(): Router {
    const router = express.Router();

    router.use(cors());
    router.use(helmet());
    router.use(express.json());
    router.use(express.urlencoded({ extended: false }));
    router.use(cookieParser());
    router.use(hpp({ whitelist: ['sort'] }));
    router.use(xss());
    router.use(compress());
    router.use(favicon(path.resolve('public', 'favicon.ico')));
    router.use(this.loggingMiddleware.asMiddleware());

    if (this.config.env === 'production') {
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
        standardHeaders: 'draft-8',
        legacyHeaders: false
      });
      router.use(limiter);
    }

    if (this.config.env === 'development') {
      router.use(statusMonitor() as unknown as express.RequestHandler);
    }

    router.get('/prometheus', async (_req, res, next) => {
      try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.send(metrics);
      } catch (err) {
        next(err);
      }
    });

    // API routes
    const apiRouter = this.createApiRouter();
    router.use(`/api/${this.config.server.version}`, apiRouter);

    // Actuator should be after API routes
    router.use(actuator() as unknown as express.RequestHandler);

    // Error handling middleware should be last
    router.use(this.errorMiddleware.asMiddleware());

    return router;
  }

  private createApiRouter(): Router {
    const apiRouter = express.Router();

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      limit: 5, // 5 requests per windowMs
      standardHeaders: 'draft-8',
      legacyHeaders: false
    });

    // Setup authentication
    apiRouter.use(this.authMiddleware.initialize());

    // Swagger docs
    apiRouter.use('/docs', this.swaggerMiddleware.getRouter());

    // Mount modules
    apiRouter.use('/user', this.userModule.router);
    apiRouter.use('/auth', authLimiter, this.authModule.router);

    return apiRouter;
  }
}
