# Enterprise Layer Architecture

## Overview
The Enterprise layer represents the core business rules and domain logic of the application. It contains the most stable and business-critical components that are least likely to change when external factors change.

## Structure
/src /enterprise /dto # Data Transfer Objects /entities # Domain Entities /enums # Enumeration Types /events # Domain Events /interfaces # Core Interfaces /types # Custom Types /validators # Validation Rules

## Rationale
The Enterprise layer design:
- Protects business rules
- Ensures maintainability
- Enables testing
- Supports scalability
- Facilitates changes


## DTO Pattern Architecture Decision Record

## Title
Standardization of Data Transfer Object (DTO) Patterns in Clean Architecture

## Context
Our TypeScript-based application follows Clean Architecture principles, which emphasizes separation of concerns and dependency rules. Data Transfer Objects (DTOs) serve as the data structures that cross boundaries between architectural layers.

We've identified inconsistent patterns and possible problems in how DTOs when we don't set some architectural rules:
- DTOs can be defined as TypeScript interfaces without validation
- Others can be implemented as classes with validation decorators from class-validator
- There's no clear guideline on when to use each approach

This kind of inconsistency creates several challenges:
- Inconsistent validation of system boundaries
- Potential for invalid data to reach core business logic
- Difficulty for developers to understand expected patterns
- Maintenance overhead due to varying approaches

## Decision
We will standardize our DTO implementation patterns based on their specific roles in the application architecture:

### 1. Input DTOs (Class-based with Validation)
For all DTOs that represent data coming into our system from external sources (API requests, file imports, etc.), we will use **class-based DTOs with validation decorators**:

- Implement as TypeScript classes with proper typing
- Use `class-validator` decorators to enforce validation rules
- Include clear error messages in validation decorators
- Use `class-transformer` for type conversion where needed
- Include `@Expose()` decorators to control property exposure
- Use non-null assertion (`!`) for required fields
- Implement static factory methods for validation and instantiation where appropriate

### 2. Output/Response DTOs (Interface-based)
For DTOs representing data being returned from our system to external consumers:

- Implement as TypeScript interfaces
- Provide comprehensive JSDoc documentation
- Focus on clear typing without validation overhead
- Use generic types where appropriate (e.g., `PaginationDTO<T>`)

### 3. Internal DTOs (Interface-based)
For DTOs used solely for data transfer between internal layers of the application:

- Implement as TypeScript interfaces
- Keep minimal with focused purpose
- Convert to domain objects before business logic is applied

## Naming Conventions
- All DTOs must end with the suffix "DTO"
- Input DTOs should be named according to their purpose (e.g., `CreateUserDTO`, `UpdateUserDTO`)
- Output DTOs should clearly indicate their response nature (e.g., `UserResponseDTO`, `PaginationDTO`)

## File Structure
```
/src
  /enterprise
    /dto
      /input        # Class-based input DTOs
        /auth       # Authentication-related DTOs
        /user       # User-related DTOs
        ...
      /output       # Interface-based output DTOs
      /internal     # Internal DTOs (if needed)
```

## Validation Strategy
- Input validation happens at system boundaries through DTO validation
- Validation errors should be captured and transformed into appropriate API responses
- Complex validation that involves multiple fields or business rules should be implemented in domain services/use cases

## Examples

### Input DTO Example (Class-based)
```typescript
import { Expose, Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, Matches } from 'class-validator';

export class CreateUserDTO {
  @Expose()
  @IsNotEmpty({ message: 'Name is required' })
  name!: string;

  @Expose()
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  // Additional properties with validation...
}
```

### Output DTO Example (Interface-based)
```typescript
/**
 * Data Transfer Object representing user information for API responses.
 */
export interface UserResponseDTO {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}
```

## Rationale
This decision:
- Enforces validation at system boundaries, preventing invalid data from entering core domains
- Provides clear, self-documenting validation rules with error messages
- Simplifies transformation between transport formats and application objects
- Reduces boilerplate code through decorators for common validation patterns
- Maintains lightweight response objects without unnecessary validation overhead
- Aligns with Clean Architecture principles by clearly separating boundary concerns

## Implications

### Positive
- Increased data integrity through consistent validation
- Improved developer experience with clear patterns
- Better alignment with Clean Architecture principles
- Self-documenting contracts through validation rules

### Negative
- Potential increase in boilerplate code for simple inputs
- Need to refactor existing DTOs to match new patterns
- Learning curve for validation decorator patterns

## Implementation Plan
1. Document this pattern in project documentation
2. Create utility functions to standardize validation
3. Refactor existing DTOs based on priority:
  - Authentication/security-related DTOs first
  - High-traffic API endpoints second
  - Remaining DTOs as time permits
4. Add linting rules to enforce naming conventions
5. Review and update related test cases

## Status
Approved

## References
- Clean Architecture principles by Robert C. Martin
- class-validator documentation: https://github.com/typestack/class-validator
- class-transformer documentation: https://github.com/typestack/class-transformer

## Entity Pattern Architecture Decision Record

### Title
Standardization of Domain Entities in Clean Architecture

### Context
Domain entities are the core objects of our business that encapsulate both data and behavior. We need clear guidelines on how to structure these entities to ensure they properly encapsulate domain logic while remaining compatible with our validation and serialization approaches.

### Decision
We will standardize our entity implementation using the following patterns:

#### 1. Dual Interface-Class Pattern
Each entity will be defined by:
- An interface (`IEntity`) that defines the data structure
- A concrete class implementation that adds behavior and validation

```typescript
// Example pattern
export interface IToken {
  // Data properties
  id?: string;
  token: string;
  // ...
}

export class Token implements IToken {
  // Properties with validation decorators
  @IsUUID()
  id?: string;

  // Domain methods and computed properties
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isValid(): boolean {
    return !this.isRevoked && !this.isExpired();
  }
}
```

#### 2. Entity Behavior Requirements
All entities must:
- Encapsulate their business rules and invariants
- Implement computed properties for derived state
- Include domain methods for operations on entity state
- Validate their own state beyond simple property validation
- Use constructor for creating valid instances
- Optionally provide factory methods for common creation patterns

#### 3. Validation Strategy
Entities will follow a multi-level validation approach:
- **Property-level validation**: Using decorators (like `@IsNotEmpty`, `@IsEmail`)
- **Entity-level validation**: Methods that validate the entity as a whole
- **Business rules validation**: Complex rules that may involve multiple properties

#### 4. Computed Properties
Entities should expose computed properties for commonly derived values:
```typescript
// Example for Token entity
class Token {
  // ...
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isValid(): boolean {
    return !this.isRevoked && !this.isExpired();
  }
}
```

#### 5. OpenAPI Documentation
All entities should include OpenAPI documentation for API generation, following the pattern:
```typescript
/**
 * @openapi
 * components:
 *   schemas:
 *     EntityName:
 *       type: object
 *       // ... schema definition
 */
```

### Specific Entity Guidelines

#### 1. Token Entity
Token entities should:
- Include methods to check expiration (`isExpired()`)
- Include methods to verify validity (`isValid()`)
- Implement revocation functionality
- Handle different token types with appropriate behavior

#### 2. User Entity
User entities should:
- Include authentication-related methods
- Provide role-based permission checking
- Handle user state transitions (active, suspended, etc.)
- Encapsulate password management logic

#### 3. Value Objects
Small immutable objects that represent concepts in our domain should be implemented as value objects:
- No identity (equality based on attributes, not identity)
- Immutable
- Self-validating
- No side effects

### Naming Conventions
- Entity interfaces should be prefixed with "I" (e.g., `IUser`, `IToken`)
- Entity classes should match the domain concept name (e.g., `User`, `Token`)
- Methods should use verb phrases describing actions (e.g., `isExpired()`, `canAccess()`)
- Computed properties should use noun or adjective phrases describing the value

### Implementation Examples

#### Token Entity Enhancement Example:
```typescript
export class Token implements IToken {
  // ... existing properties with decorators

  constructor(partial: Partial<Token>) {
    Object.assign(this, partial);
  }

  // Computed properties
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isValid(): boolean {
    return !this.isRevoked && !this.isExpired();
  }

  // Domain methods
  revoke(): void {
    this.isRevoked = true;
    this.updatedAt = new Date();
  }

  extendExpiration(durationInMs: number): void {
    this.expiresAt = new Date(this.expiresAt.getTime() + durationInMs);
    this.updatedAt = new Date();
  }

  // Domain validation
  validate(): boolean {
    if (this.isRevoked) return false;
    if (this.isExpired()) return false;
    return true;
  }
}
```

### Rationale
This approach:
- Encourages rich domain models with behavior, not just data
- Centralizes business rules in the entity classes
- Provides a consistent structure for all entities
- Improves code readability and maintainability
- Reduces duplication of business logic across use cases
- Supports testing of business rules in isolation

### Consequences
- More complex entity classes with additional responsibility
- It may require more careful testing of entity behavior
- Need for careful consideration of domain boundaries


## Enum Pattern Architecture Decision Record

### Title
Standardization of Enumeration Types in the Application

### Context
Enumerations are used throughout the application to represent fixed sets of values. They play a crucial role in maintaining type safety and business logic consistency.

### Decision
We will standardize our enum implementation patterns based on the following guidelines:

#### 1. Structure and Location
- All enums will be located in `/src/enterprise/enums`
- One enum per file
- Files named in PascalCase matching the enum name

#### 2. Documentation Requirements
- Comprehensive JSDoc documentation for each enum
- Description of the enum's purpose
- Documentation for each enum value
- Usage examples where applicable
- Related business rules or constraints

#### 3. Implementation Pattern
```typescript
/**
 * Represents [description of what the enum represents]
 *
 * @example
 * ```typescript
 * const tokenType = TokenType.ACCESS;
 * ```
*/
export enum EnumName {
/** Description of this value */
VALUE_ONE = 'VALUE_ONE',
/** Description of this value */
VALUE_TWO = 'VALUE_TWO'
}

// Optional: Type guard function
export const isValidEnumName = (value: string): value is EnumName => {
return Object.values(EnumName).includes(value as EnumName);
};
```

#### 4. Naming Conventions
- Enum names should be PascalCase
- Enum values should be UPPER_SNAKE_CASE
- Values should be string literals matching their keys

### Example Implementation

```typescript
/**
 * Represents the types of authentication tokens used in the system.
 *
 * These tokens are used for different authentication and authorization purposes
 * throughout the application.
 *
 * @example
 * ```typescript
 * const tokenType = TokenType.ACCESS;
 * ```
*/
export enum TokenType {
/** Used for API access authentication */
ACCESS = 'ACCESS',
/** Used for generating new access tokens */
REFRESH = 'REFRESH',
/** Used for email verification process */
VERIFICATION = 'VERIFICATION',
/** Used in password reset flow */
RESET_PASSWORD = 'RESET_PASSWORD'
}

export const isValidTokenType = (value: string): value is TokenType => {
return Object.values(TokenType).includes(value as TokenType);
};
```

### Benefits
- Consistent implementation across the codebase
- Improved type safety and validation
- Better documentation for developers
- Easier maintenance and updates

## Domain Events Architecture Decision Record

### Title
Standardization of Domain Events Pattern in Clean Architecture

### Context
Domain Events are crucial for maintaining loose coupling between different parts of the application while enabling reactive behavior to business operations. They serve as a mechanism for different parts of the system to react to important domain changes without direct coupling.

### Decision
We will standardize our Domain Events implementation following these patterns:

#### 1. Structure and Location
```typescript
/src
  /enterprise
    /events
      /base           # Base event classes
      /user          # User-related events
      /auth          # Authentication-related events
      /handlers      # Event handlers
      index.ts       # Event registry and exports
```

#### 2. Event Implementation Pattern

```typescript
/**
 * Represents a domain event that occurred within the system.
 *
 * @abstract
 */
export abstract class DomainEvent {
  /** Timestamp when the event occurred */
  readonly occurredOn: Date;

  protected constructor() {
    this.occurredOn = new Date();
  }

  /**
   * Gets the type identifier for the event
   * @returns {string} The event type identifier
   */
  abstract get eventType(): string;
}

/**
 * Represents an event that occurs when [business action] happens.
 *
 * @extends {DomainEvent}
 */
export class BusinessEvent extends DomainEvent {
  constructor(
    public readonly payload: PayloadDTO,
    public readonly metadata?: Record<string, unknown>
  ) {
    super();
  }

  get eventType(): string {
    return 'BusinessEventType';
  }
}
```

#### 3. Event Naming Conventions
- Event class names should end with 'Event'
- Event types should be in PascalCase
- Event names should be in past tense (e.g., UserCreated, TokenGenerated)

#### 4. Event Handler Pattern
```typescript
/**
 * Interface for event handlers
 */
export interface EventHandler<T extends DomainEvent> {
  handle(event: T): Promise<void>;
}
```

#### 5. Event Documentation Requirements
- JSDoc documentation for each event class
- Description of when the event is triggered
- Description of the event payload
- Usage examples
- Related business rules or constraints

### Implementation Examples

```typescript
/**
 * Event emitted when a new user is created in the system.
 *
 * This event is triggered after successful user registration and
 * can be used to perform post-registration actions like sending
 * welcome emails or setting up user resources.
 *
 * @extends {DomainEvent}
 */
export class UserCreatedEvent extends DomainEvent {
  constructor(
    public readonly user: UserResponseDTO
  ) {
    super();
  }

  get eventType(): string {
    return 'UserCreated';
  }
}

/**
 * Handler for processing user creation events
 *
 * @implements {EventHandler<UserCreatedEvent>}
 */
export class UserCreatedHandler implements EventHandler<UserCreatedEvent> {
  async handle(event: UserCreatedEvent): Promise<void> {
    // Handler implementation
  }
}
```

### Event Registry
- Maintain a central registry of all domain events
- Enable type-safe event dispatching and handling
- Provide event documentation and discovery

```typescript
export const EventRegistry = {
  UserCreated: UserCreatedEvent,
  TokenCreated: TokenCreatedEvent,
  ForgotPassword: ForgotPasswordEvent
} as const;

export type EventTypes = keyof typeof EventRegistry;
```

### Benefits
- Consistent implementation across the codebase
- Clear audit trail of domain changes
- Decoupled system components
- Easy to extend and maintain
- Type-safe event handling


# Repository Implementation Guidelines

## Naming Conventions
- Methods should reflect business operations
- Use consistent naming across repositories

## Error Handling
- Use consistent error types
- Document error conditions

## Pagination
- Use standard pagination DTOs
- Consistent parameter naming

## Documentation
- JSDoc for all public methods
- Include business rules
- Document error conditions


# Use Cases Architecture

## Overview
Use Cases represent the application's business rules and orchestrate the flow of data to and from entities. They implement the application's specific business rules and act as a bridge between the outer layers and the enterprise business rules.

## Structure
/src /application /use_cases /auth LoginUser.ts LogoutUser.ts VerifyEmail.ts ForgotPassword.ts ResetPassword.ts /base UseCase.ts /interfaces UseCaseResponse.ts

## Design Principles

### 1. Single Responsibility
Each use case class should implement only one specific business operation. This ensures that classes remain focused and maintainable.

### 2. Input/Output Ports
Use cases should define clear input and output ports:
- Input ports define the data structure expected by the use case
- Output ports define the data structure returned by the use case

### 3. Error Handling
Use cases should handle errors in a consistent manner:
- Business rule violations should throw specific error types
- Technical errors should be wrapped in use case specific errors
- All errors should be properly logged and tracked

### 4. Dependencies
Use cases should:
- Depend only on abstractions (interfaces)
- Never depend directly on frameworks or external agencies
- Receive all dependencies through constructor injection

### 5. Testing
All use cases must be thoroughly tested:
- Unit tests for business logic
- Integration tests for dependency interaction
- Error cases must be explicitly tested

