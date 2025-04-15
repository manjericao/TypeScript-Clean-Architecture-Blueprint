import { inject, injectable } from 'inversify';
import express, { NextFunction, Request, Response } from 'express';
import { Types } from '@interface/types';
import passport from 'passport';
import status from 'http-status';
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptions } from 'passport-jwt';
import { IConfig } from '@application/contracts/infrastructure';
import { ITokenBlackList } from '@application/contracts/security/authentication';
import { IUserRepository } from '@application/contracts/domain/repositories';
import { IExpressMiddleware } from '@infrastructure/web/middleware/IExpressMiddleware';
import { IAuthMiddleware } from '@infrastructure/web/middleware/IAuthMiddleware';

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  tokenType: string;
  iat: number;
  exp: number;
}

@injectable()
export class AuthMiddleware implements IAuthMiddleware {
  private isInitialized: boolean = false;

  constructor(
    @inject(Types.UserRepository) private readonly userRepository: IUserRepository,
    @inject(Types.Config) private readonly config: IConfig,
    @inject(Types.TokenBlackList) private readonly tokenBlackList: ITokenBlackList
  ) {
    this.setup();
  }

  public handle(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (!this.isInitialized) {
      res.status(status.UNAUTHORIZED).json({
        type: 'UnauthorizedError',
        message: 'Authentication middleware not initialized'
      });
      return;
    }

    void this.handleAuthentication(req, res, next);
  }

  public asMiddleware(): express.RequestHandler {
    return (req, res, next) => this.handle(req, res, next);
  }

  private async handleAuthentication(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

      if (!token) {
        res.status(status.UNAUTHORIZED).json({
          type: 'UnauthorizedError',
          message: 'No token provided'
        });
        return;
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.tokenBlackList.isBlackListed(token);
      if (isBlacklisted) {
        res.status(status.UNAUTHORIZED).json({
          type: 'UnauthorizedError',
          message: 'Token has been revoked'
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      passport.authenticate(
        'jwt',
        { session: false },
        (err: Error | null, user: Express.User | false | null) => {
          if (err) {
            next(err);
            return;
          }

          if (!user) {
            res.status(status.UNAUTHORIZED).json({
              type: 'UnauthorizedError',
              message: 'Unauthorized access'
            });
            return;
          }

          req.user = user;
          next();
        }
      )(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  public initialize(): express.RequestHandler {
    return passport.initialize();
  }

  private setup(): void {
    if (this.isInitialized) {
      return;
    }

    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: this.config.jwt.secret,
      algorithms: ['HS256'],
      ignoreExpiration: false
    };

    passport.use(
      new JwtStrategy(options, (jwtPayload: JwtPayload, done) => {
        if (!jwtPayload.userId) {
          return done(null, false);
        }

        void this.userRepository.findById(jwtPayload.userId)
          .then(user => {
            if (!user) {
              return done(null, false);
            }
            return done(null, user);
          })
          .catch(error => {
            return done(error, false);
          });
      })
    );

    this.isInitialized = true;
  }
}
