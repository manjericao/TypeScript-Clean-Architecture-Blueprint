import { ValidationError } from 'class-validator';

/**
 * Custom error class for handling validation errors in Data Transfer Objects.
 * Used across the application to standardize DTO validation error handling.
 */
export class DTOValidationError extends Error {
  /**
   * @param validationErrors The array of validation errors from class-validator
   */
  constructor(public readonly validationErrors: ValidationError[]) {
    super('Validation failed');
    this.name = 'DTOValidationError';

    Object.setPrototypeOf(this, DTOValidationError.prototype);
  }

  /**
   * Formats the validation errors into a human-readable message
   */
  getFormattedErrors(): Record<string, string[]> {
    const formatted: Record<string, string[]> = {};

    for (const error of this.validationErrors) {
      if (!error.property || !error.constraints) continue;

      formatted[error.property] = Object.values(error.constraints);
    }

    return formatted;
  }
}
