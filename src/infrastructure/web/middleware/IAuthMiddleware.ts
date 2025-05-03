import express from 'express';

import { IExpressMiddleware } from '@infrastructure/web/middleware/IExpressMiddleware';

/**
 * Interface representing authentication middleware.
 * Extends the functionality of the IExpressMiddleware interface.
 */
export interface IAuthMiddleware extends IExpressMiddleware {
  /**
   * Initializes the authentication middleware
   */
  initialize(): express.RequestHandler;
}
