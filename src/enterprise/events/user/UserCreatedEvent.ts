import { UserResponseDTO } from '@enterprise/dto/output';
import { DomainEvent, EventOptions } from '@enterprise/events/base';

/**
 * Represents an event triggered when a new user is created.
 * This event contains the information of the created user and additional options, if provided.
 *
 * Extends the base DomainEvent class.
 *
 * @class UserCreatedEvent
 * @extends DomainEvent
 *
 * @param {UserResponseDTO} user - The data transfer object containing details of the created user.
 * @param {EventOptions} [options] - Optional metadata or configurations for the event.
 *
 * @property {string} eventType - Returns the type of the event as 'UserCreated'.
 */
export class UserCreatedEvent extends DomainEvent {
  constructor(
    public readonly user: UserResponseDTO,
    options?: EventOptions
  ) {
    super(options);
  }

  get eventType(): string {
    return 'UserCreated';
  }
}
