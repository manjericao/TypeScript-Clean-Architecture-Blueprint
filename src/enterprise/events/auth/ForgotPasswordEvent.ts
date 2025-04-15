import { DomainEvent, EventOptions } from '@enterprise/events/base';
import { TokenResponseDTO, UserResponseDTO } from '@enterprise/dto/output';

/**
 * Event emitted when a user requests a password reset.
 *
 * This event is triggered when a user initiates the forgot password flow
 * and includes both user information and the reset token details.
 */
export class ForgotPasswordEvent extends DomainEvent {
  constructor(
    public readonly user: UserResponseDTO,
    public readonly token: TokenResponseDTO,
    options?: EventOptions
  ) {
    super(options);
  }

  get eventType(): string {
    return 'ForgotPassword';
  }
}
