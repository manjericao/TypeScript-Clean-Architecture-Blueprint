import { IMiddleware } from '@application/contracts/infrastructure';
import { UserRole } from '@enterprise/enum';

/**
 * An interface representing an authorization middleware that extends the base middleware functionality.
 * It provides methods to enforce role-based access control.
 */
export interface IAuthorizationMiddleware extends IMiddleware {
  /**
   * Ensures that the calling user has the required roles to access specific functionality
   * or resources within the application.
   *
   * @param {UserRole[]} roles - An array of roles required for the user to proceed.
   * @return {unknown} The result of the access control check or related process.
   */
  requireRoles(roles: UserRole[]): unknown;
}
