import { ILogger } from '@application/contracts/infrastructure';
import { AbstractOperation } from '@application/use_cases/base/AbstractOperation';
import { BaseOperationEvents, OperationError } from '@application/use_cases/base/OperationTypes';

/**
 * An abstract base class for operations that use a logger and emit success or error events.
 * This class extends {@link AbstractOperation} and provides functionality for structured logging
 * and event handling during the lifecycle of an operation.
 *
 * @template TEventMap - Describes the shape of the event map for the operation. Must extend {@link BaseOperationEvents}.
 *
 * @extends AbstractOperation<TEventMap>
 */
export abstract class BaseOperation<
  TEventMap extends BaseOperationEvents<unknown>
> extends AbstractOperation<TEventMap> {
  protected readonly logger: ILogger;

  protected constructor(eventNames: Array<keyof TEventMap>, logger: ILogger) {
    super(eventNames);
    this.logger = logger;
  }

  /**
   * Emits a success event with the provided data and logs the operation's success.
   *
   * @param {BaseOperationEvents} data - The data to be emitted with the success event.
   * @return {boolean} Returns true if the event was successfully emitted, otherwise false.
   */
  protected emitSuccess<T>(data: T): boolean {
    this.logger.info(`Operation ${this.constructor.name} succeeded`, {
      operation: this.constructor.name,
      data
    });
    return this.emitOutput('SUCCESS' as keyof TEventMap, data as TEventMap[keyof TEventMap]);
  }

  /**
   * Emits an error event with the provided `OperationError` instance.
   * Logs the error details using the associated logger for debugging purposes.
   *
   * @param {OperationError} error - The error instance to be emitted and logged.
   * @return {boolean} Returns `true` if the error event was successfully emitted, otherwise `false`.
   */
  protected emitError(error: OperationError): boolean {
    this.logger.error(`Operation ${this.constructor.name} failed`, {
      operation: this.constructor.name,
      error
    });
    return this.emitOutput('ERROR' as keyof TEventMap, error as TEventMap[keyof TEventMap]);
  }
}
