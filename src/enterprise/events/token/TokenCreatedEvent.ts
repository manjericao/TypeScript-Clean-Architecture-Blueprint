import { DomainEvent, EventOptions } from '@enterprise/events/base';
import { UserResponseDTO } from '@enterprise/dto/output';

/**
 * Event emitted when a new authentication token is created.
 *
 * This event is triggered when a new token is generated for a user,
 * typically during login or token refresh operations.
 */
export class TokenCreatedEvent extends DomainEvent {
  constructor(public readonly user: UserResponseDTO, options?: EventOptions) {
    super(options);
  }

  get eventType(): string {
    return 'TokenCreated';
  }
}
