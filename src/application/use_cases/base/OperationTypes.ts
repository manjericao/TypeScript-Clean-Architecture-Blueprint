/**
 * Represents an error that occurs during an operation, extending the standard Error object.
 * This class includes additional properties to provide more context about the error.
 *
 * @class OperationError
 * @extends {Error}
 * @param {string} code A unique string code identifying the specific type of error.
 * @param {string} message A human-readable description of the error.
 * @param {unknown} [details] Optional additional information about the error, which can be of any type.
 */
export class OperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'OperationError';

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Represents the base structure for operation events.
 *
 * @template TSuccess The type of the success event value.
 * @property {TSuccess} SUCCESS The representation of a successful event.
 * @property {OperationError} ERROR The representation of an error event.
 */
export interface BaseOperationEvents<TSuccess> {
  SUCCESS: TSuccess;
  ERROR: OperationError;
}
