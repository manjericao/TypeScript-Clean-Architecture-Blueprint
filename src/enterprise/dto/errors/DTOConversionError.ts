/**
 * Custom error for DTO conversion failures
 */
export class DTOConversionError extends Error {
  constructor(message: string, public readonly source: unknown) {
    super(message);
    this.name = 'DTOConversionError';
    Object.setPrototypeOf(this, DTOConversionError.prototype);
  }
}
