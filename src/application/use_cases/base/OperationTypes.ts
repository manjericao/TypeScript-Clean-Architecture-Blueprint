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

export interface BaseOperationEvents<TSuccess> {
  SUCCESS: TSuccess;
  ERROR: OperationError;
}

