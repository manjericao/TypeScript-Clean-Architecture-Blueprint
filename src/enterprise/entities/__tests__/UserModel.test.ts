import { describe, it, expect } from '@jest/globals';
import { validate } from 'class-validator';
import { User } from '@enterprise/entities/UserModel';
import { UserRole } from '@enterprise/enum/UserRole';
import { Gender } from '@enterprise/enum/Gender';
import { faker } from '@faker-js/faker';

describe('User model validation', () => {
  /**
   * Creates a valid user data object for testing
   */
  const createValidUserData = () => ({
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    username: faker.internet.username(),
    password: faker.internet.password(),
    role: UserRole.USER,
    birthDate: faker.date.past(),
    gender: Gender.MALE,
    isVerified: faker.datatype.boolean(),
  });

  /**
   * Tests that a valid user can be created with all required properties.
   */
  it('can be created with valid attributes', async () => {
    const validUserData = createValidUserData();

    const validUser = new User(validUserData);
    const errors = await validate(validUser);

    expect(errors.length).toBe(0);
    expect(validUser).toBeInstanceOf(User);
    expect(validUser.id).toBe(validUserData.id);
    expect(validUser.name).toBe(validUserData.name);
    expect(validUser.email).toBe(validUserData.email);
    expect(validUser.username).toBe(validUserData.username);
    expect(validUser.password).toBe(validUserData.password);
    expect(validUser.role).toBe(validUserData.role);
    expect(validUser.birthDate).toBe(validUserData.birthDate);
    expect(validUser.gender).toBe(validUserData.gender);
    expect(validUser.isVerified).toBe(validUserData.isVerified);
  });

  /**
   * This test documents that creating a user with missing required attributes would raise validation errors at runtime.
   */
  it('fails validation with missing required attributes', async () => {
    const incompleteUser = new User({});
    const errors = await validate(incompleteUser);

    // Since required fields are missing, we expect errors for name, email, username, password, role, and isVerified.
    expect(errors.length).toBeGreaterThan(0);

    // Check specific required fields have validation errors
    const requiredFields = ['name', 'email', 'username', 'password', 'role', 'isVerified'];
    requiredFields.forEach(field => {
      const fieldError = errors.find(err => err.property === field);
      expect(fieldError).toBeDefined();
    });
  });

  /**
   * Tests that invalid email formats are caught by validation.
   */
  it('validates email format correctly', async () => {
    const userData = createValidUserData();
    const userWithInvalidEmail = new User({
      ...userData,
      email: 'not-an-email',
    });
    const errors = await validate(userWithInvalidEmail);
    const emailError = errors.find((err) => err.property === 'email');
    expect(emailError).toBeDefined();
    expect(emailError!.constraints).toHaveProperty('isEmail');
  });

  /**
   * Tests that a valid email passes validation.
   */
  it('accepts valid email format', async () => {
    const userData = createValidUserData();
    const userWithValidEmail = new User({
      ...userData,
      email: 'test@example.com',
    });
    const errors = await validate(userWithValidEmail);
    const emailError = errors.find((err) => err.property === 'email');
    expect(emailError).toBeUndefined();
  });

  /**
   * Tests that an empty name is rejected.
   */
  it('throws validation error for empty name', async () => {
    const userData = createValidUserData();
    const userWithEmptyName = new User({
      ...userData,
      name: '',
    });
    const errors = await validate(userWithEmptyName);
    const nameError = errors.find((err) => err.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toHaveProperty('isNotEmpty');
  });

  /**
   * Tests that an empty username is rejected.
   */
  it('throws validation error for empty username', async () => {
    const userData = createValidUserData();
    const userWithEmptyUsername = new User({
      ...userData,
      username: '',
    });
    const errors = await validate(userWithEmptyUsername);
    const usernameError = errors.find((err) => err.property === 'username');
    expect(usernameError).toBeDefined();
    expect(usernameError!.constraints).toHaveProperty('isNotEmpty');
  });

  /**
   * Tests that an empty password is rejected.
   */
  it('throws validation error for empty password', async () => {
    const userData = createValidUserData();
    const userWithEmptyPassword = new User({
      ...userData,
      password: '',
    });
    const errors = await validate(userWithEmptyPassword);
    const passwordError = errors.find((err) => err.property === 'password');
    expect(passwordError).toBeDefined();
    expect(passwordError!.constraints).toHaveProperty('isNotEmpty');
  });

  /**
   * Tests that an invalid gender (not in the enum) gets rejected.
   */
  it('throws validation error for invalid gender value', async () => {
    const userData = createValidUserData();
    const userWithInvalidGender = new User({
      ...userData,
      gender: 'INVALID' as any, // force an invalid value
    });
    const errors = await validate(userWithInvalidGender);
    const genderError = errors.find((err) => err.property === 'gender');
    expect(genderError).toBeDefined();
    expect(genderError!.constraints).toHaveProperty('isEnum');
  });

  /**
   * Tests that all valid gender values are accepted.
   */
  it('accepts all valid gender values', async () => {
    const userData = createValidUserData();

    // Test each gender value
    for (const genderValue of Object.values(Gender)) {
      const user = new User({
        ...userData,
        gender: genderValue,
      });

      const errors = await validate(user);
      const genderError = errors.find((err) => err.property === 'gender');
      expect(genderError).toBeUndefined();
      expect(user.gender).toBe(genderValue);
    }
  });

  /**
   * Tests that an invalid role (not in the enum) gets rejected.
   */
  it('throws validation error for invalid role value', async () => {
    const userData = createValidUserData();
    const userWithInvalidRole = new User({
      ...userData,
      role: 'INVALID' as any, // force an invalid value
    });
    const errors = await validate(userWithInvalidRole);
    const roleError = errors.find((err) => err.property === 'role');
    expect(roleError).toBeDefined();
    expect(roleError!.constraints).toHaveProperty('isEnum');
  });

  /**
   * Tests that all valid role values are accepted.
   */
  it('accepts all valid role values', async () => {
    const userData = createValidUserData();

    // Test each role value
    for (const roleValue of Object.values(UserRole)) {
      const user = new User({
        ...userData,
        role: roleValue,
      });

      const errors = await validate(user);
      const roleError = errors.find((err) => err.property === 'role');
      expect(roleError).toBeUndefined();
      expect(user.role).toBe(roleValue);
    }
  });

  /**
   * Tests that an invalid birthDate format gets rejected.
   */
  it('throws validation error for invalid birthDate', async () => {
    const userData = createValidUserData();
    const userWithInvalidBirthDate = new User({
      ...userData,
      birthDate: 'not-a-date' as any, // force an invalid value
    });
    const errors = await validate(userWithInvalidBirthDate);
    const birthDateError = errors.find((err) => err.property === 'birthDate');
    expect(birthDateError).toBeDefined();
    expect(birthDateError!.constraints).toHaveProperty('isDate');
  });

  /**
   * Tests that a valid birthDate is accepted.
   */
  it('accepts valid birthDate', async () => {
    const userData = createValidUserData();
    const userWithValidBirthDate = new User({
      ...userData,
      birthDate: new Date(),
    });
    const errors = await validate(userWithValidBirthDate);
    const birthDateError = errors.find((err) => err.property === 'birthDate');
    expect(birthDateError).toBeUndefined();
  });

  /**
   * Tests that the birthDate field is optional.
   */
  it('accepts user without gender', async () => {
    // Create data explicitly without gender
    const userData = {
      id: faker.string.uuid(),
      name: faker.person.fullName(),
      email: faker.internet.email(),
      username: faker.internet.username(),
      password: faker.internet.password(),
      role: UserRole.USER,
      birthDate: faker.date.past(),
      isVerified: faker.datatype.boolean(),
    };

    const userWithoutGender = new User(userData);
    const errors = await validate(userWithoutGender);
    const genderError = errors.find((err) => err.property === 'gender');
    expect(genderError).toBeUndefined();
    expect(userWithoutGender.gender).toBeUndefined();
  });

  /**
   * Tests that the gender field is optional.
   */
  it('accepts user without gender', async () => {
    const userData = createValidUserData();
    const { gender, ...userDataWithoutGender } = userData;

    const userWithoutGender = new User(userDataWithoutGender);
    const errors = await validate(userWithoutGender);
    const genderError = errors.find((err) => err.property === 'gender');
    expect(genderError).toBeUndefined();
    expect(userWithoutGender.gender).toBeUndefined();
  });

  /**
   * Tests that an invalid isVerified value gets rejected.
   */
  it('throws validation error for invalid isVerified value', async () => {
    const userData = createValidUserData();
    const userWithInvalidIsVerified = new User({
      ...userData,
      isVerified: 'not-a-boolean' as any, // force an invalid value
    });
    const errors = await validate(userWithInvalidIsVerified);
    const isVerifiedError = errors.find((err) => err.property === 'isVerified');
    expect(isVerifiedError).toBeDefined();
    expect(isVerifiedError!.constraints).toHaveProperty('isBoolean');
  });

  /**
   * Tests that both valid isVerified values (true and false) are accepted.
   */
  it('accepts both true and false for isVerified', async () => {
    const userData = createValidUserData();

    // Test with isVerified = true
    const userWithIsVerifiedTrue = new User({
      ...userData,
      isVerified: true,
    });
    let errors = await validate(userWithIsVerifiedTrue);
    let isVerifiedError = errors.find((err) => err.property === 'isVerified');
    expect(isVerifiedError).toBeUndefined();
    expect(userWithIsVerifiedTrue.isVerified).toBe(true);

    // Test with isVerified = false
    const userWithIsVerifiedFalse = new User({
      ...userData,
      isVerified: false,
    });
    errors = await validate(userWithIsVerifiedFalse);
    isVerifiedError = errors.find((err) => err.property === 'isVerified');
    expect(isVerifiedError).toBeUndefined();
    expect(userWithIsVerifiedFalse.isVerified).toBe(false);
  });
});
