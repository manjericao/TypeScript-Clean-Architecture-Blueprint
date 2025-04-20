import { DomainEvent, EventOptions } from '@enterprise/events/base';

/**
 * Represents an event triggered when a user has been deleted.
 * This class extends the DomainEvent base class and provides specific
 * information about the deletion of a user within the system.
 *
 * The `UserDeletedEvent` contains the unique identifier (`userId`) of the
 * user who has been deleted. The `eventType` getter provides the type
 * of event as a string, which is 'UserDeleted'.
 *
 * @class
 * @extends DomainEvent
 *
 * @param {string} userId - The unique identifier of the deleted user.
 * @param {EventOptions} [options] - Additional options for the event, if any.
 */
export class UserDeletedEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    options?: EventOptions
  ) {
    super(options);
  }

  get eventType(): string {
    return 'UserDeleted';
  }
}
