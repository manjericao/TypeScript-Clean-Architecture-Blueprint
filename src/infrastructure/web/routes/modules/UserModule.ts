import { inject, injectable } from 'inversify';
import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { Types } from '@interface/types';
import { UserController } from '@interface/http/controllers/user';
import { ExpressAdapter } from '@infrastructure/web/adapters';
import { AuthMiddleware } from '@infrastructure/web/middleware';
import { IAuthorizationMiddleware } from '@application/contracts/security/authorization';
import { UserRole } from '@enterprise/enum';

@injectable()
export class UserModule {
  private readonly _router: Router;

  constructor(
    @inject(Types.UserController) private readonly userController: UserController,
    @inject(Types.AuthMiddleware) private readonly authMiddleware: AuthMiddleware,
    @inject(Types.AuthorizationMiddleware) private readonly authorizationMiddleware: IAuthorizationMiddleware
  ) {
    this._router = this.configureRouter();
  }

  private configureRouter(): Router {
    const router = Router();

    /**
     * @swagger
     * tags:
     *   name: User
     *   description: User Resources
     */

    /**
     * @swagger
     * /user:
     *   post:
     *     summary: Create a new user
     *     tags: [User]
     *     description: Creates a new user with provided information
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/User'
     *     responses:
     *       201:
     *         description: User successfully created
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/User'
     *       400:
     *         description: Validation error
     *       409:
     *         description: User already exists with the provided email or username
     *       500:
     *         description: Server error
     */
    router.post(
      '/',
      (req: Request, res: Response, next: NextFunction) =>
        this.userController.createUser()._createUser(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        ).catch(next)
    );

    /**
     * @swagger
     * /user:
     *   get:
     *     summary: Get all users with pagination
     *     tags: [User]
     *     security:
     *       - bearerAuth: []
     *     description: Retrieves a paginated list of all users. Requires ADMIN or USER role.
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *           default: 1
     *         description: Page number for pagination
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           default: 10
     *         description: Number of results per page
     *     responses:
     *       200:
     *         description: Successful operation
     *         headers:
     *           x-page:
     *             schema:
     *               type: integer
     *             description: Current page number
     *           x-limit:
     *             schema:
     *               type: integer
     *             description: Items per page
     *           x-total:
     *             schema:
     *               type: integer
     *             description: Total number of items
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/User'
     *       401:
     *         description: Unauthorized - Missing or invalid authentication token
     *       403:
     *         description: Forbidden - User does not have required role (ADMIN or USER)
     *       500:
     *         description: Server error
     */
    router.get(
      '/',
      this.authMiddleware.asMiddleware(),
      this.authorizationMiddleware.requireRoles([UserRole.ADMIN, UserRole.USER]) as RequestHandler,
      (req: Request, res: Response, next: NextFunction) =>
        this.userController.getAllUsers()._getAllUsers(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        ).catch(next)
    );

    /**
     * @swagger
     * /user/{id}:
     *   get:
     *     summary: Get user by ID
     *     tags: [User]
     *     security:
     *       - bearerAuth: []
     *     description: Returns a user by their ID. Requires ADMIN or USER role.
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: User ID
     *     responses:
     *       200:
     *         description: Successful operation
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/User'
     *       400:
     *         description: Invalid ID supplied
     *       401:
     *         description: Unauthorized - Missing or invalid authentication token
     *       403:
     *         description: Forbidden - User does not have required role (ADMIN or USER)
     *       404:
     *         description: User not found
     *       500:
     *         description: Server error
     */
    router.get(
      '/:id',
      this.authMiddleware.asMiddleware(),
      this.authorizationMiddleware.requireRoles([UserRole.ADMIN, UserRole.USER]) as RequestHandler,
      (req: Request, res: Response, next: NextFunction) =>
        this.userController.getUser()._getUser(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        ).catch(next)
    );

    /**
     * @swagger
     * /user/{id}:
     *   delete:
     *     summary: Delete user
     *     tags: [User]
     *     security:
     *       - bearerAuth: []
     *     description: Deletes a user by their ID. Requires ADMIN role.
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: User ID to delete
     *     responses:
     *       204:
     *         description: User successfully deleted
     *       400:
     *         description: Invalid ID supplied
     *       401:
     *         description: Unauthorized - Missing or invalid authentication token
     *       403:
     *         description: Forbidden - User does not have ADMIN role
     *       404:
     *         description: User not found
     *       500:
     *         description: Server error
     */
    router.delete(
      '/:id',
      this.authMiddleware.asMiddleware(),
      this.authorizationMiddleware.requireRoles([UserRole.ADMIN]) as RequestHandler,
      (req: Request, res: Response, next: NextFunction) =>
        this.userController.removeUser()._removeUser(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        ).catch(next)
    );

    /**
     * @swagger
     * /user/{id}:
     *   put:
     *     summary: Update user by ID
     *     tags: [User]
     *     security:
     *       - bearerAuth: []
     *     description: Updates a user with the provided information. Requires ADMIN role.
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: User ID
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               name:
     *                 type: string
     *               email:
     *                 type: string
     *                 format: email
     *               username:
     *                 type: string
     *               birthDate:
     *                 type: string
     *                 format: date
     *               gender:
     *                 type: string
     *                 enum: [MALE, FEMALE, OTHER]
     *     responses:
     *       200:
     *         description: User successfully updated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/User'
     *       400:
     *         description: Validation error
     *       401:
     *         description: Unauthorized - Missing or invalid authentication token
     *       403:
     *         description: Forbidden - User does not have ADMIN role
     *       404:
     *         description: User not found
     *       409:
     *         description: Email or username already taken
     *       500:
     *         description: Server error
     */
    router.put(
      '/:id',
      this.authMiddleware.asMiddleware(),
      this.authorizationMiddleware.requireRoles([UserRole.ADMIN]) as RequestHandler,
      (req: Request, res: Response, next: NextFunction) =>
        this.userController.updateUser()._updateUser(
          ExpressAdapter.toHttpRequest(req),
          ExpressAdapter.toHttpResponse(res),
          ExpressAdapter.toHttpNext(next)
        ).catch(next)
    );

    return router;
  }

  get router(): Router {
    return this._router;
  }
}
