import { Operation } from '@application/use_cases/base';
import { CreateUserDTO } from '@enterprise/dto/input/user';
import { validate } from 'class-validator';
import { UserCreatedEvent } from '@enterprise/events/user';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { ILogger } from '@application/contracts/infrastructure';
import { IUserRepository } from '@application/contracts/domain/repositories';

/**
 * Interface representing the events related to user creation.
 * This interface extends a generalized record structure to map event keys to their associated values.
 * It provides a standardized way to handle various outcomes of user creation.
 *
 * @interface CreateUserEvents
 */
interface CreateUserEvents extends Record<string, unknown> {
  SUCCESS: CreateUserDTO;
  ERROR: Error;
  VALIDATION_ERROR: string;
  USER_EXISTS: string;
}

/**
 * The CreateUser class is responsible for handling the creation of new user accounts.
 * It extends the Operation class and utilizes dependencies such as IUserRepository for managing
 * user-related operations and IPasswordHasher for securing user passwords.
 */
export class CreateUser extends Operation<CreateUserEvents> {

  /**
   * Constructs an instance of the class.
   *
   * @param {IUserRepository} UserRepository - The repository for user data operations.
   * @param {IPasswordHasher} PasswordHasher - The utility for hashing and validating passwords.
   * @param {ILogger} logger - The logging service for recording events and errors.
   * @return {void}
   */
  constructor(private UserRepository: IUserRepository, private PasswordHasher: IPasswordHasher, private logger: ILogger, ) {
    super(['SUCCESS', 'ERROR', 'VALIDATION_ERROR', 'USER_EXISTS']);
  }

  /**
   * Executes the user creation process. Validates the user input, checks for existing
   * users with the same email or username, hashes the password, and saves the user to the repository.
   * Emits specific outputs based on the operation's result.
   *
   * @param {CreateUserDTO} UserDTO - An object containing the user details for creation, including
   * attributes like name, email, role, birth date, gender, username, password, and repeat_password.
   * @return {Promise<void>} A promise that resolves when the process is complete.
   */
  async execute(UserDTO: CreateUserDTO): Promise<void> {
    const { SUCCESS, ERROR, VALIDATION_ERROR, USER_EXISTS } = this.outputs;

    try {
      this.logger.info('Creating new user', { email: UserDTO.email });

      const errors = await validate(UserDTO);
      if (errors.length > 0) {
        this.emitOutput(VALIDATION_ERROR, errors);
        return;
      }

      const [emailExists, usernameExists] = await Promise.all([
        this.UserRepository.findByEmail(UserDTO.email),
        this.UserRepository.findByUsername(UserDTO.username)
      ]);

      if (emailExists) {
        this.emitOutput(USER_EXISTS, `User with email ${UserDTO.email} already exists`);
        return;
      }

      if (usernameExists) {
        this.emitOutput(USER_EXISTS, `Username ${UserDTO.username} is already taken`);
        return;
      }

      if (UserDTO.password !== UserDTO.repeatPassword) {
        this.emitOutput(VALIDATION_ERROR, 'Passwords do not match');
        return;
      }

      const passwordHashed = await this.PasswordHasher.hashPassword(UserDTO.password)

      const userCreated = await this.UserRepository.create({
        name: UserDTO.name,
        email: UserDTO.email,
        role: UserDTO.role,
        birthDate: UserDTO.birthDate,
        gender: UserDTO.gender,
        password: passwordHashed,
        username: UserDTO.username,
        repeatPassword: passwordHashed
      });

      this.logger.info('User created successfully', { userId: userCreated.id })

      this.publishDomainEvent(new UserCreatedEvent(userCreated));

      this.emitOutput(SUCCESS, userCreated);
    } catch (error) {
      this.emitOutput(ERROR, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
