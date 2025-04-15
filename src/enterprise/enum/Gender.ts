/**
 * Represents gender options available in the system.
 *
 * This enum provides standardized gender options for user profiles while being
 * inclusive of different gender identities.
 */
export enum Gender {
  /** Represents male gender identity */
  MALE = 'MALE',
  /** Represents female gender identity */
  FEMALE = 'FEMALE',
  /** Represents non-binary gender identity */
  NON_BINARY = 'NON-BINARY'
}

export const isValidGender = (value: string): value is Gender => {
  return Object.values(Gender).includes(value as Gender);
};
