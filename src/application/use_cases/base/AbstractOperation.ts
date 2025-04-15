import { EventEmitter } from 'events';
import { DomainEvent } from '@enterprise/events/base';

export abstract class AbstractOperation<EventMap> {
  private static readonly globalEventEmitter = new EventEmitter();
  protected readonly outputs: Map<keyof EventMap, Array<(event: EventMap[keyof EventMap]) => void>>;

  protected constructor(eventNames: Array<keyof EventMap>) {
    this.outputs = AbstractOperation.createOutputs<EventMap>(eventNames);
  }

  private static createOutputs<T>(eventNames: Array<keyof T>): Map<keyof T, Array<(event: T[keyof T]) => void>> {
    return new Map(eventNames.map(name => [name, []]));
  }

  protected emitOutput<K extends keyof EventMap>(eventName: K, event: EventMap[K]): boolean {
    const handlers = this.outputs.get(eventName) || [];
    handlers.forEach(handler => handler(event));
    return handlers.length > 0;
  }

  protected publishDomainEvent<T extends DomainEvent>(event: T): void {
    AbstractOperation.globalEventEmitter.emit(event.eventType, event);
  }

  protected subscribeTo<T>(event: string, handler: (event: T) => void): void {
    AbstractOperation.globalEventEmitter.on(event, handler as (...args: unknown[]) => void);
  }

  protected unsubscribeFrom<T>(eventType: string, handler: (event: T) => void): void {
    AbstractOperation.globalEventEmitter.removeListener(eventType, handler);
  }

  on<K extends keyof EventMap>(eventName: K, handler: (event: EventMap[K]) => void): void {
    const handlers = this.outputs.get(eventName) || [];
    handlers.push(handler as (event: unknown) => void);
    this.outputs.set(eventName, handlers);
  }

  onTyped<K extends keyof EventMap>(eventName: K): Promise<EventMap[K]> {
    return new Promise(resolve => {
      this.on(eventName, resolve);
    });
  }
}
