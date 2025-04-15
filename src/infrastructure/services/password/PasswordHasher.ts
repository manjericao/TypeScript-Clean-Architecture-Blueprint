import * as bcrypt from 'bcryptjs';
import { IPasswordHasher } from '@application/contracts/security/encryption';

/**
 * Implementation of the password hashing provider using bcrypt.
 *
 * @class
 * @implements {IPasswordHasher}
 */
export class PasswordHasher implements IPasswordHasher {
  /**
   * The number of salt rounds to use for password hashing.
   *
   * @private
   * @readonly
   */
  private readonly saltRounds: number

  /**
   * Creates an instance of the PasswordHasher.
   *
   * @param {number} [saltRounds=10] - The number of salt rounds to use for password hashing.
   */
  constructor(saltRounds: number = 10) {
    this.saltRounds = saltRounds
  }

  /**
   * Hashes a given password using bcrypt.
   *
   * @param {string} password - The password to hash.
   * @returns {Promise<string>} The hashed password.
   */
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(this.saltRounds)
    return await bcrypt.hash(password, salt)
  }

  /**
   * Compares a plain text password with a hashed password to check for a match.
   *
   * @param {string} password - The plain text password.
   * @param {string} hashedPassword - The hashed password to compare against.
   * @returns {Promise<boolean>} True if the passwords match, false otherwise.
   */
  async comparePasswords(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword)
  }
}
