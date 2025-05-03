import express, { NextFunction, Request, Response } from 'express';
import status from 'http-status';
import { injectable } from 'inversify';

import { IAuthorizationMiddleware } from '@application/contracts/security/authorization';
import { UserRole } from '@enterprise/enum';
import { IExpressMiddleware } from '@infrastructure/web/middleware/IExpressMiddleware';

@injectable()
export class AuthorizationMiddleware implements IAuthorizationMiddleware, IExpressMiddleware {
  public handle(_req: express.Request, _res: express.Response, next: express.NextFunction): void {
    next();
  }

  public asMiddleware(): express.RequestHandler {
    return (req, res, next) => this.handle(req, res, next);
  }

  public requireRoles(allowedRoles: UserRole[]): express.RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const user = req.user as { role: UserRole } | undefined;

        if (!user || !user.role) {
          res.status(status.UNAUTHORIZED).json({
            type: 'UnauthorizedError',
            message: 'User not authenticated'
          });
          return;
        }

        if (!allowedRoles.includes(user.role)) {
          res.status(status.FORBIDDEN).json({
            type: 'ForbiddenError',
            message: 'Insufficient permissions'
          });
          return;
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }
}
