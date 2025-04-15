import { AbstractOperation } from '@application/use_cases/base/AbstractOperation';
import { BaseOperationEvents, OperationError } from '@application/use_cases/base/OperationTypes';
import { ILogger } from '@application/contracts/infrastructure';

export abstract class BaseOperation<
  TEventMap extends BaseOperationEvents<unknown>
> extends AbstractOperation<TEventMap> {
  protected readonly logger: ILogger;

  protected constructor(
    eventNames: Array<keyof TEventMap>,
    logger: ILogger
  ) {
    super(eventNames);
    this.logger = logger;
  }

  protected emitSuccess<T>(data: T): boolean {
    this.logger.info(`Operation ${this.constructor.name} succeeded`, {
      operation: this.constructor.name,
      data
    });
    return this.emitOutput('SUCCESS' as keyof TEventMap, data as TEventMap[keyof TEventMap]);
  }

  protected emitError(error: OperationError): boolean {
    this.logger.error(`Operation ${this.constructor.name} failed`, {
      operation: this.constructor.name,
      error
    });
    return this.emitOutput('ERROR' as keyof TEventMap, error as TEventMap[keyof TEventMap]);
  }
}
