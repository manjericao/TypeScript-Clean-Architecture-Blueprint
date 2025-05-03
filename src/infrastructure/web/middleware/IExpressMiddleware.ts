import express from 'express';

import { IMiddleware } from '@application/contracts/infrastructure';

/**
 * Represents an interface for Express middleware, extending the functionality
 * of the base IMiddleware interface with specific methods tailored for use with
 * Express.js request, response, and next function objects.
 */
export interface IExpressMiddleware
  extends IMiddleware<express.Request, express.Response, express.NextFunction> {
  /**
   * Returns Express-compatible middleware
   */
  asMiddleware(): express.RequestHandler | express.ErrorRequestHandler;
}
