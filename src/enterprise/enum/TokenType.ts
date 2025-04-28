/**
 * Represents the adapters of authentication tokens used in the system.
 *
 * These tokens are used for different authentication and authorization purposes
 * throughout the application.
 */
export enum TokenType {
  /** Used for API access authentication with a short expiration time */
  ACCESS = 'ACCESS',
  /** Used for generating new access tokens with a longer expiration time */
  REFRESH = 'REFRESH',
  /** Used for an email verification process */
  VERIFICATION = 'VERIFICATION',
  /** Used in password reset flow with time-limited validity */
  RESET_PASSWORD = 'RESET_PASSWORD'
}

export const isValidTokenType = (value: string): value is TokenType => {
  return Object.values(TokenType).includes(value as TokenType);
};
