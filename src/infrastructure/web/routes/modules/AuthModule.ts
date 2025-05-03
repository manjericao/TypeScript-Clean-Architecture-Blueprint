import { Router, Request, Response, NextFunction } from 'express';
import { inject, injectable } from 'inversify';

import { ExpressAdapter } from '@infrastructure/web/adapters';
import { AuthMiddleware } from '@infrastructure/web/middleware';
import { AuthController } from '@interface/http/controllers/auth';
import { Types } from '@interface/types';

@injectable()
export class AuthModule {
  private readonly _router: Router;

  constructor(
    @inject(Types.AuthController) private readonly authController: AuthController,
    @inject(Types.AuthMiddleware) private readonly authMiddleware: AuthMiddleware
  ) {
    this._router = this.configureRouter();
  }

  private configureRouter(): Router {
    const router = Router();

    /**
     * @swagger
     * tags:
     *   name: Auth
     *   description: Authentication Resources
     */

    /**
     * @swagger
     * /auth/verify-email:
     *   get:
     *     summary: Verify user email
     *     tags: [Auth]
     *     description: Verifies a user's email address using the provided token
     *     parameters:
     *       - in: query
     *         name: token
     *         required: true
     *         schema:
     *           type: string
     *         description: Email verification token
     *     responses:
     *       200:
     *         description: Email verified successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                 userId:
     *                   type: string
     *       400:
     *         description: Invalid or expired token
     *       404:
     *         description: Token or user not found
     *       500:
     *         description: Server error
     */
    router.get('/verify-email', (req: Request, res: Response, next: NextFunction) =>
      this.authController
        .verifyEmail()
        ._verifyEmail(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        )
        .catch(next)
    );

    /**
     * @swagger
     * /auth/login:
     *   post:
     *     summary: User login
     *     tags: [Auth]
     *     description: Authenticates a user and returns an access token
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - email
     *               - password
     *             properties:
     *               email:
     *                 type: string
     *                 format: email
     *                 description: User's email address
     *               password:
     *                 type: string
     *                 format: password
     *                 description: User's password
     *     responses:
     *       200:
     *         description: Successful login
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 userId:
     *                   type: string
     *                 token:
     *                   type: string
     *       401:
     *         description: Invalid credentials
     *       403:
     *         description: Email not verified or account disabled
     *       404:
     *         description: User not found
     *       500:
     *         description: Server error
     */
    router.post('/login', (req: Request, res: Response, next: NextFunction) =>
      this.authController
        .login()
        ._login(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        )
        .catch(next)
    );

    /**
     * @swagger
     * /auth/logout:
     *   post:
     *     summary: User logout
     *     tags: [Auth]
     *     description: Logs out a user by invalidating their tokens
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - refreshToken
     *             properties:
     *               refreshToken:
     *                 type: string
     *                 description: User's refresh token
     *     responses:
     *       200:
     *         description: Successfully logged out
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: "Successfully logged out"
     *       400:
     *         description: Invalid or missing tokens
     *       500:
     *         description: Server error
     */
    router.post(
      '/logout',
      this.authMiddleware.asMiddleware(),
      (req: Request, res: Response, next: NextFunction) =>
        this.authController
          .logout()
          ._logout(
            ExpressAdapter.toHttpRequest(req),
            ExpressAdapter.toHttpResponse(res),
            ExpressAdapter.toHttpNext(next)
          )
          .catch(next)
    );

    /**
     * @swagger
     * /auth/forgot-password:
     *   post:
     *     summary: Forgot password
     *     tags: [Auth]
     *     description: Initiates the password reset process by sending a reset token to the provided email.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - email
     *             properties:
     *               email:
     *                 type: string
     *                 format: email
     *                 description: The user's email address to send the reset token.
     *     responses:
     *       200:
     *         description: Reset password email sent successfully.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *       400:
     *         description: Validation error.
     *       404:
     *         description: User not found.
     *       500:
     *         description: Server error.
     */
    router.post('/forgot-password', (req: Request, res: Response, next: NextFunction) =>
      this.authController
        .forgotPassword()
        ._forgotPassword(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        )
        .catch(next)
    );

    /**
     * @swagger
     * /auth/reset-password:
     *   post:
     *     summary: Reset password
     *     tags: [Auth]
     *     description: Resets the user's password using a provided token and new password.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - token
     *               - password
     *             properties:
     *               token:
     *                 type: string
     *                 description: The reset password token.
     *               password:
     *                 type: string
     *                 format: password
     *                 description: The new password.
     *     responses:
     *       200:
     *         description: Password reset successfully.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *       400:
     *         description: Validation error or token error.
     *       404:
     *         description: User or token not found.
     *       500:
     *         description: Server error.
     */
    router.post('/reset-password', (req: Request, res: Response, next: NextFunction) =>
      this.authController
        .resetPassword()
        ._resetPassword(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        )
        .catch(next)
    );

    /**
     * @swagger
     * /auth/send-verification-email:
     *   post:
     *     summary: Send verification email
     *     tags: [Auth]
     *     description: Sends a verification email to a user to verify their email address
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - email
     *             properties:
     *               email:
     *                 type: string
     *                 format: email
     *                 description: User's email address
     *     responses:
     *       200:
     *         description: Verification email sent successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: Verification email sent successfully
     *       404:
     *         description: User not found
     *       400:
     *         description: Invalid request or email already verified
     *       500:
     *         description: Server error
     */
    router.post('/send-verification-email', (req: Request, res: Response, next: NextFunction) =>
      this.authController
        .sendEmailOnUserCreation()
        ._sendEmailOnUserCreation(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        )
        .catch(next)
    );

    return router;
  }

  get router(): Router {
    return this._router;
  }
}
