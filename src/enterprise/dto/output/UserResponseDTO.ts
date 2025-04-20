import { UserRole, Gender } from '@enterprise/enum';

/**
 * UserResponseDTO is a data transfer object class that represents the structure
 * of user data typically used for retrieving user information from a system.
 *
 * This class defines the properties associated with a user, including
 * required and optional fields.
 */
export class UserResponseDTO {
  /**
   * Represents a unique identifier for an entity.
   * This variable is mandatory and must be a string.
   */
  id!: string;
  /**
   * Represents the name of an entity.
   * This variable is mandatory.
   *
   * @type {string}
   */
  name!: string;
  /**
   * Represents an email address associated with an entity.
   * This variable is mandatory and expected to hold a valid email format.
   */
  email!: string;
  /**
   * Represents the username of a user.
   * This variable is expected to hold a string value that uniquely identifies a user.
   * It is a required property and cannot be undefined or null.
   */
  username!: string;
  /**
   * Represents the role assigned to a user.
   * This variable holds the user's role and determines permissions and access levels
   * within the application. It is mandatory and must be assigned a value.
   *
   * Type: UserRole
   */
  role!: UserRole;
  /**
   * Represents the birthdate of an individual.
   * This property is optional and may not always be provided.
   * The value is expected to be a Date object if specified.
   */
  birthDate?: Date;
  /**
   * Represents the gender of an individual.
   * This value is optional and may not always be provided.
   *
   * @type {Gender | undefined}
   */
  gender?: Gender;
  /**
   * A boolean variable that indicates whether something has been verified.
   *
   * This variable is typically used to determine if an entity, user, or process has completed a verification step.
   * It should hold the value of `true` if the verification has been successfully completed, and `false` otherwise.
   */
  isVerified!: boolean;
}
