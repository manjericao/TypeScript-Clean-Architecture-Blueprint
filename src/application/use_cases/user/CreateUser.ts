import { IUserRepository } from '@application/contracts/domain/repositories';
import { ILogger } from '@application/contracts/infrastructure';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { BaseOperation, BaseOperationEvents, OperationError } from '@application/use_cases/base';
import { CreateUserDTO } from '@enterprise/dto/input/user';
import { UserResponseDTO } from '@enterprise/dto/output';
import { UserCreatedEvent } from '@enterprise/events/user';

/**
 * Defines the events specific to the CreateUser operation.
 * Extends BaseOperationEvents to include standard SUCCESS and ERROR,
 * plus specific failure cases like VALIDATION_ERROR and USER_EXISTS.
 * - SUCCESS: Emitted with the UserResponseDTO of the newly created user.
 * - ERROR: Emitted with an OperationError for unexpected issues.
 * - VALIDATION_ERROR: Emitted with a string message for input validation failures (e.g., password mismatch).
 * - USER_EXISTS: Emitted with a string message when the email or username is already taken.
 */
type CreateUserEvents = BaseOperationEvents<UserResponseDTO> & {
  VALIDATION_ERROR: string;
  USER_EXISTS: string;
};

/**
 * CreateUser is a class responsible for handling the user creation process.
 * It includes validation, checks for conflicts such as existing email or username,
 * hashes the user's password, and triggers necessary events on completion.
 * Extends BaseOperation to manage events such as SUCCESS, ERROR, VALIDATION_ERROR, and USER_EXISTS.
 *
 * @extends BaseOperation<CreateUserEvents>
 */
export class CreateUser extends BaseOperation<CreateUserEvents> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    readonly logger: ILogger
  ) {
    super(['SUCCESS', 'ERROR', 'VALIDATION_ERROR', 'USER_EXISTS'], logger);
  }

  /**
   * Executes the user creation process.
   * Validates input, checks for conflicts, creates the user, and emits events.
   *
   * @param {CreateUserDTO} userDTO - The input DTO containing the new user's details.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async execute(userDTO: CreateUserDTO): Promise<void> {
    this.logger.info(`CreateUser operation started for email: ${userDTO.email}`, {
      input: userDTO
    });

    try {
      if (userDTO.password !== userDTO.repeatPassword) {
        const message = 'Passwords do not match.';
        this.logger.warn!(`CreateUser validation failed: ${message}`, { email: userDTO.email });
        this.emitOutput('VALIDATION_ERROR', message);
        return;
      }

      this.logger.debug(
        `Checking for existing user with email ${userDTO.email} or username ${userDTO.username}`
      );
      const [emailExists, usernameExists] = await Promise.all([
        this.userRepository.findByEmail(userDTO.email),
        this.userRepository.findByUsername(userDTO.username)
      ]);

      if (emailExists) {
        const message = `User with email ${userDTO.email} already exists.`;
        this.logger.warn!(`CreateUser failed: ${message}`);
        this.emitOutput('USER_EXISTS', message);
        return;
      }

      if (usernameExists) {
        const message = `Username ${userDTO.username} is already taken.`;
        this.logger.warn!(`CreateUser failed: ${message}`);
        this.emitOutput('USER_EXISTS', message);
        return;
      }

      this.logger.debug(`Hashing password for user ${userDTO.email}`);
      const passwordHashed = await this.passwordHasher.hashPassword(userDTO.password);

      const userToCreate = {
        name: userDTO.name,
        email: userDTO.email,
        username: userDTO.username,
        password: passwordHashed,
        repeatPassword: passwordHashed,
        role: userDTO.role,
        birthDate: userDTO.birthDate,
        gender: userDTO.gender
      };

      this.logger.debug(`Attempting to create user in repository`, { email: userDTO.email });
      const createdUser: UserResponseDTO = await this.userRepository.create(userToCreate);

      this.publishDomainEvent(new UserCreatedEvent(createdUser));
      this.logger.info(`Published UserCreatedEvent for user ${createdUser.id}`);

      this.logger.info(`CreateUser succeeded: User created.`, { userId: createdUser.id });
      this.emitSuccess(createdUser);
    } catch (error) {
      this.logger.error(`CreateUser failed unexpectedly.`, { email: userDTO.email, error });
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(
        new OperationError('CREATE_USER_FAILED', `Failed to create user: ${err.message}`, err)
      );
    }
  }
}
