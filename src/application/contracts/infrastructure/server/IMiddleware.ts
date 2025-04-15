/**
 * Interface representing a middleware component in an application.
 *
 * @template TRequest - The type of the incoming request object.
 * @template TResponse - The type of the outgoing response object.
 * @template TNext - The type of the "next" function or object used to proceed to the next middleware.
 * @template TError - Optional error type for error middleware.
 */
export interface IMiddleware<
  TRequest = unknown,
  TResponse = unknown,
  TNext = unknown,
  TError = unknown
> {
  /**
   * Handles the middleware operation
   */
  handle(
    first: TError | TRequest,
    second: TRequest | TResponse,
    third: TResponse | TNext,
    fourth?: TNext
  ): Promise<void> | void;
}
