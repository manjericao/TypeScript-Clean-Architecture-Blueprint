import { EventMetadata, EventOptions } from '@enterprise/events/base/EventMetadata';

/**
 * Base class for all domain events in the system.
 *
 * Domain events represent important changes or occurrences within the system
 * that other parts of the application might need to react to.
 *
 * @abstract
 */
export abstract class DomainEvent {
  /** Unique identifier for the event instance */
  readonly eventId: string;

  /** Metadata associated with the event */
  readonly metadata: EventMetadata;

  protected constructor(options?: EventOptions) {
    this.eventId = crypto.randomUUID();
    this.metadata = {
      correlationId: options?.correlationId || this.eventId,
      causationId: options?.causationId,
      timestamp: new Date(),
      actor: options?.actor || 'system',
      context: options?.context
    };
  }

  /**
   * Gets the type identifier for the event
   * @returns {string} The event type identifier
   */
  abstract get eventType(): string;

  /**
   * Creates a new event options object for child events,
   * maintaining the correlation chain
   */
  protected createChildEventOptions(actor?: string): EventOptions {
    return {
      correlationId: this.metadata.correlationId,
      causationId: this.eventId,
      actor: actor || this.metadata.actor
    };
  }
}
