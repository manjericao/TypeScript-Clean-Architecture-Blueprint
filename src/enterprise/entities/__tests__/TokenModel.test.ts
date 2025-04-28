import { describe, it, expect } from '@jest/globals';
import { validate } from 'class-validator';
import { Token } from '@enterprise/entities/TokenModel';
import { TokenType } from '@enterprise/enum/TokenType';
import { faker } from '@faker-js/faker';

describe('Token model validation', () => {
  /**
   * Tests that a valid token can be created with all required properties.
   */
  it('can be created with valid attributes', async () => {
    const expiresAt = faker.date.future();

    const validTokenData = {
      id: faker.string.uuid(),
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: expiresAt,
      isRevoked: faker.datatype.boolean(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
    };

    const validToken = new Token(validTokenData);
    const errors = await validate(validToken);

    expect(errors.length).toBe(0);
    expect(validToken).toBeInstanceOf(Token);
    expect(validToken.userId).toBe(validTokenData.userId);
    expect(validToken.token).toBe(validTokenData.token);
    expect(validToken.type).toBe(TokenType.ACCESS);
    expect(validToken.expiresAt).toBe(validTokenData.expiresAt);
    expect(validToken.isRevoked).toBe(validTokenData.isRevoked);
  });

  /**
   * This test documents that creating a token with missing required attributes would raise validation errors at runtime.
   */
  it('fails validation with missing required attributes', async () => {
    const incompleteToken = new Token({});
    const errors = await validate(incompleteToken);

    // Since required fields are missing, we expect errors for userId, token, type, expiresAt, and isRevoked.
    expect(errors.length).toBeGreaterThan(0);
  });

  /**
   * Tests that invalid UUID format for userId is caught by validation.
   */
  it('validates userId UUID format correctly', async () => {
    const tokenWithInvalidUserId = new Token({
      userId: 'not-a-uuid',
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: faker.date.future(),
      isRevoked: false,
    });
    const errors = await validate(tokenWithInvalidUserId);
    const userIdError = errors.find((err) => err.property === 'userId');
    expect(userIdError).toBeDefined();
    // Check that the isUUID constraint is triggered
    expect(userIdError!.constraints).toHaveProperty('isUuid');
  });

  /**
   * Tests all valid token adapters to ensure they pass validation
   */
  it('accepts all valid token adapters', async () => {
    // Test each token type
    for (const tokenType of Object.values(TokenType)) {
      const token = new Token({
        userId: faker.string.uuid(),
        token: faker.string.alphanumeric(64),
        type: tokenType,
        expiresAt: faker.date.future(),
        isRevoked: false,
      });

      const errors = await validate(token);
      expect(errors.length).toBe(0);
      expect(token.type).toBe(tokenType);
    }
  });

  /**
   * Tests that an invalid token type (not in the enum) gets rejected.
   */
  it('throws validation error for invalid token type', async () => {
    const tokenWithInvalidType = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: 'INVALID' as any, // force an invalid value
      expiresAt: faker.date.future(),
      isRevoked: false,
    });
    const errors = await validate(tokenWithInvalidType);
    const typeError = errors.find((err) => err.property === 'type');
    expect(typeError).toBeDefined();
    expect(typeError!.constraints).toHaveProperty('isEnum');
  });

  /**
   * Tests that an invalid date format for expiresAt gets rejected.
   */
  it('throws validation error for invalid expiresAt date', async () => {
    const tokenWithInvalidExpiry = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: 'not-a-date' as any, // force an invalid value
      isRevoked: false,
    });
    const errors = await validate(tokenWithInvalidExpiry);
    const expiryError = errors.find((err) => err.property === 'expiresAt');
    expect(expiryError).toBeDefined();
    expect(expiryError!.constraints).toHaveProperty('isDate');
  });

  /**
   * Tests that an invalid boolean for isRevoked gets rejected.
   */
  it('throws validation error for invalid isRevoked boolean', async () => {
    const tokenWithInvalidRevoked = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: faker.date.future(),
      isRevoked: 'not-a-boolean' as any, // force an invalid value
    });
    const errors = await validate(tokenWithInvalidRevoked);
    const revokedError = errors.find((err) => err.property === 'isRevoked');
    expect(revokedError).toBeDefined();
    expect(revokedError!.constraints).toHaveProperty('isBoolean');
  });

  /**
   * Tests that optional fields (createdAt, updatedAt) can be provided with valid values.
   */
  it('accepts valid optional fields', async () => {
    const tokenWithOptionals = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: faker.date.future(),
      isRevoked: false,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
    });
    const errors = await validate(tokenWithOptionals);
    expect(errors.length).toBe(0);
    expect(tokenWithOptionals.createdAt).toBeDefined();
    expect(tokenWithOptionals.updatedAt).toBeDefined();
  });

  /**
   * Tests that optional fields with invalid values are rejected.
   */
  it('throws validation error for invalid optional dates', async () => {
    const tokenWithInvalidOptionals = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: faker.date.future(),
      isRevoked: false,
      createdAt: 'not-a-date' as any,
      updatedAt: 'also-not-a-date' as any,
    });
    const errors = await validate(tokenWithInvalidOptionals);
    const createdAtError = errors.find((err) => err.property === 'createdAt');
    const updatedAtError = errors.find((err) => err.property === 'updatedAt');
    expect(createdAtError).toBeDefined();
    expect(updatedAtError).toBeDefined();
    expect(createdAtError!.constraints).toHaveProperty('isDate');
    expect(updatedAtError!.constraints).toHaveProperty('isDate');
  });

  /**
   * Tests the isExpired method returns true when the token has expired.
   */
  it('isExpired returns true for an expired token', () => {
    const pastDate = new Date(Date.now() - 1000); // 1 second ago
    const expiredToken = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: pastDate,
      isRevoked: false,
    });

    expect(expiredToken.isExpired()).toBe(true);
  });

  /**
   * Tests the isExpired method returns false when the token has not expired.
   */
  it('isExpired returns false for a non-expired token', () => {
    const futureDate = new Date(Date.now() + 3600000); // 1 hour in the future
    const validToken = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: futureDate,
      isRevoked: false,
    });

    expect(validToken.isExpired()).toBe(false);
  });

  /**
   * Tests the isValid method returns false when the token is revoked.
   */
  it('isValid returns false for a revoked token', () => {
    const futureDate = new Date(Date.now() + 3600000); // 1 hour in the future
    const revokedToken = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: futureDate,
      isRevoked: true,
    });

    expect(revokedToken.isValid()).toBe(false);
  });

  /**
   * Tests the isValid method returns false when the token has expired.
   */
  it('isValid returns false for an expired token', () => {
    const pastDate = new Date(Date.now() - 1000); // 1 second ago
    const expiredToken = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: pastDate,
      isRevoked: false,
    });

    expect(expiredToken.isValid()).toBe(false);
  });

  /**
   * Tests the isValid method returns true when the token is not revoked and not expired.
   */
  it('isValid returns true for a valid token', () => {
    const futureDate = new Date(Date.now() + 3600000); // 1 hour in the future
    const validToken = new Token({
      userId: faker.string.uuid(),
      token: faker.string.alphanumeric(64),
      type: TokenType.ACCESS,
      expiresAt: futureDate,
      isRevoked: false,
    });

    expect(validToken.isValid()).toBe(true);
  });

  /**
   * Tests the expiration edge case - token expires exactly now.
   */
  it('handles the expiration edge case correctly', () => {
    // Mock Date.now to return a fixed timestamp
    const originalNow = Date.now;
    const fixedTime = 1609459200000; // 2021-01-01T00:00:00.000Z
    global.Date.now = jest.fn(() => fixedTime);

    try {
      // Create a token that expires exactly now
      const expiresExactlyNow = new Date(fixedTime);
      const tokenAtEdge = new Token({
        userId: faker.string.uuid(),
        token: faker.string.alphanumeric(64),
        type: TokenType.ACCESS,
        expiresAt: expiresExactlyNow,
        isRevoked: false,
      });

      // A token that expires exactly now should be considered expired
      expect(tokenAtEdge.isExpired()).toBe(true);
      expect(tokenAtEdge.isValid()).toBe(false);
    } finally {
      // Restore the original Date.now function
      global.Date.now = originalNow;
    }
  });
});
