import { UserRole } from '@enterprise/enum';

/**
 * Data Transfer Object representing user information with sensitive authentication data.
 *
 * SECURITY SENSITIVE: This DTO includes the hashed password and should NEVER be
 * returned to clients or used outside the authentication flow.
 *
 * This interface defines the structure of the user object used during authentication to validate credentials
 * and confirm account status for login functionality.
 */
export interface UserWithPasswordDTO {
  /**
   * A unique identifier represented as a string.
   * Typically used to distinguish individual objects, entities, or records within a system.
   */
  id: string;
  /**
   * Represents an email address.
   * This variable holds a string formatted as a valid email address,
   * commonly used for identifying or contacting a user.
   */
  email: string;
  /**
   * Represents a user's password.
   * This variable is a string containing the password required to authenticate
   * a user within the system.
   *
   * @security This value should never be exposed to clients or logged.
   */
  password: string;
  /**
   * Represents the role assigned to a user within the system.
   * The role determines the user's level of access and permissions.
   * Possible values are defined in the UserRole enumeration.
   */
  role: UserRole;
  /**
   * A boolean variable used to indicate whether the subject, user, or entity
   * has been verified. This typically represents the completion of
   * a verification process and is set to `true` if verified,
   * otherwise `false`.
   */
  isVerified: boolean;
}
