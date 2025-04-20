/**
 * Interface for common event metadata
 */
export interface EventMetadata {
  /** Unique identifier to track related events across the system */
  correlationId?: string;
  /** ID of the event that caused this event */
  causationId?: string;
  /** When the event occurred */
  timestamp: Date;
  /** Who or what triggered the event */
  actor?: string;
  /** Additional context-specific metadata */
  context?: Record<string, unknown>;
}

/**
 * Options for creating a new event
 */
export interface EventOptions {
  correlationId?: string;
  causationId?: string;
  actor?: string;
  context?: Record<string, unknown>;
}
