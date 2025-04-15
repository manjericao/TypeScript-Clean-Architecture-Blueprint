/**
 * Enum representing the roles of a user in the system.
 *
 * This enum is used to define and restrict the roles that a user can have, ensuring consistency throughout the application.
 *
 * Roles:
 * - ADMIN: Represents an administrative user with elevated privileges.
 * - USER: Represents a standard user with regular access.
 */
export enum UserRole {
  /**
   * A constant variable representing the 'ADMIN' role or designation.
   * Typically used to denote administrative permissions or access levels
   * within an application or system. This value is immutable.
   */
  ADMIN = 'ADMIN',
  /**
   * Represents the identifier for a user.
   * It is used to denote or reference a user-related entity or concept in the system.
   * This variable acts as a constant and typically holds a string value.
   */
  USER = 'USER'
}

export const isValidUserRole = (value: string): value is UserRole => {
  return Object.values(UserRole).includes(value as UserRole);
};
