import { EventEmitter } from 'events';

import { DomainEvent } from '@enterprise/events/base';

/**
 * AbstractOperation provides a flexible structure for managing event-driven interactions
 * within a domain. It supports both local event handling specific to the instance and
 * global event publishing and subscription through a shared EventEmitter.
 *
 * This class is designed to be extended and utilized in scenarios where event-driven
 * communication patterns are employed.
 *
 * Type Parameters:
 * - `EventMap`: A type mapping event names to their corresponding payload types.
 *
 * Key Features:
 * 1. **Instance-Level Events**:
 *    - Events specific to an instance are stored in a `Map` called `outputs`, where
 *      each event name maps to an array of subscribers (event handlers).
 *    - Events can be emitted and listened to using methods provided by this class.
 *
 * 2. **Global Events**:
 *    - A static `EventEmitter` is used to handle global event publishing and subscription.
 *    - These global events provide a mechanism for interactions that are not tied
 *      to the lifecycle or scope of a specific instance.
 *
 * 3. **Typed Handlers**:
 *    - Events and their handlers are strongly typed. The `EventMap` type ensures that
 *      handlers only receive data structures they are designed to process for a given event type.
 *
 * Protected Methods:
 * - `emitOutput`: Emits an event to all subscribers of a specific local event.
 * - `publishDomainEvent`: Publishes a domain event globally using the shared EventEmitter.
 * - `subscribeTo`: Subscribes to a global event with a handler.
 * - `unsubscribeFrom`: Removes a handler from a global event.
 *
 * Public Methods:
 * - `on`: Subscribes a handler to a local event specific to the instance.
 * - `onTyped`: Awaits a single occurrence of a specific local event and resolves it as a promise.
 */
export abstract class AbstractOperation<EventMap> {
  private static readonly globalEventEmitter = new EventEmitter();
  protected readonly outputs: Map<keyof EventMap, Array<(event: EventMap[keyof EventMap]) => void>>;

  protected constructor(eventNames: Array<keyof EventMap>) {
    this.outputs = AbstractOperation.createOutputs<EventMap>(eventNames);
  }

  /**
   * Creates a map of event names to arrays of event handler functions.
   *
   * @param {Array<keyof T>} eventNames - An array of event names to initialize the map keys with.
   * @return {Map<keyof T, Array<(event: T[keyof T]) => void>>} A map where each key is an event name, and each value is an empty array of event handler functions.
   */
  private static createOutputs<T>(
    eventNames: Array<keyof T>
  ): Map<keyof T, Array<(event: T[keyof T]) => void>> {
    return new Map(eventNames.map((name) => [name, []]));
  }

  /**
   * Emits an event to all registered handlers for a given event name.
   *
   * @param {K} eventName - The name of the event to emit. This should be a key from the EventMap.
   * @param {EventMap[K]} event - The event payload associated with the given event name.
   * @return {boolean} - A boolean indicating whether there were any handlers for the given event name.
   */
  protected emitOutput<K extends keyof EventMap>(eventName: K, event: EventMap[K]): boolean {
    const handlers = this.outputs.get(eventName) || [];
    handlers.forEach((handler) => handler(event));
    return handlers.length > 0;
  }

  /**
   * Publishes a domain event to the global event emitter.
   *
   * @param {T} event The domain event to be published.
   * Must extend the `DomainEvent` class.
   * @return {void} Does not return a value.
   */
  protected publishDomainEvent<T extends DomainEvent>(event: T): void {
    AbstractOperation.globalEventEmitter.emit(event.eventType, event);
  }

  /**
   * Subscribes to a specific event with a provided handler.
   *
   * @param {string} event - The name of the event to subscribe to.
   * @param {(event: T) => void} handler - A callback function to handle the event when triggered.
   * @return {void} This method does not return a value.
   */
  protected subscribeTo<T>(event: string, handler: (event: T) => void): void {
    AbstractOperation.globalEventEmitter.on(event, handler as (...args: unknown[]) => void);
  }

  /**
   * Unsubscribes the provided event handler from the specified event type.
   *
   * @param {string} eventType - The type of event to unsubscribe from.
   * @param {(event: T) => void} handler - The event handler to remove.
   * @return {void} This method does not return a value.
   */
  protected unsubscribeFrom<T>(eventType: string, handler: (event: T) => void): void {
    AbstractOperation.globalEventEmitter.removeListener(eventType, handler);
  }

  /**
   * Registers an event handler for a specified event.
   *
   * @param {K} eventName - The name of the event to listen for. Must be a key of the EventMap.
   * @param {(event: EventMap[K]) => void} handler - The callback function to handle the event. Receives the event object as a parameter.
   * @return {void} This method does not return a value.
   */
  on<K extends keyof EventMap>(eventName: K, handler: (event: EventMap[K]) => void): void {
    const handlers = this.outputs.get(eventName) || [];
    handlers.push(handler as (event: unknown) => void);
    this.outputs.set(eventName, handlers);
  }

  /**
   * Attaches a one-time event listener for the specified event name and returns a promise that resolves with the event data when the event is emitted.
   *
   * @param {K} eventName - The name of the event to listen for, which must be a valid key in `EventMap`.
   * @return {Promise<EventMap[K]>} A promise that resolves with the data associated with the emitted event.
   * @template K
   */
  onTyped<K extends keyof EventMap>(eventName: K): Promise<EventMap[K]> {
    return new Promise((resolve) => {
      this.on(eventName, resolve);
    });
  }
}
