import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { TokenRepositoryMongo } from '@infrastructure/db/mongo/repository/TokenRepositoryMongo';
import { TokenType } from '@enterprise/enum';
import { Types } from '@interface/types';
import { Container } from 'inversify';
import { CreateTokenDTO } from '@enterprise/dto/input/token';
import mongoose from 'mongoose';
import { Token } from '@infrastructure/db/mongo/models/TokenMongo';
import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';

describe('TokenRepositoryMongo', () => {
  let mongoContainer: StartedTestContainer;
  let mongoUri: string;
  let tokenRepository: TokenRepositoryMongo;
  let container: Container;
  let connection: mongoose.Connection;

  // Helper function to generate a valid token DTO
  const generateTokenDTO = (override: Partial<CreateTokenDTO> = {}): CreateTokenDTO => {
    return {
      userId: uuidv4(),
      token: faker.string.alphanumeric(32),
      type: faker.helpers.arrayElement(Object.values(TokenType)),
      expiresAt: faker.date.future(),
      isRevoked: false,
      ...override
    };
  };

  beforeAll(async () => {
    mongoContainer = await new GenericContainer('mongo:6.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage('Waiting for connections'))
      .start();

    // Get connection URI for MongoDB
    const mongoPort = mongoContainer.getMappedPort(27017);
    const mongoHost = mongoContainer.getHost();
    mongoUri = `mongodb://${mongoHost}:${mongoPort}/testdb`;

    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    connection = mongoose.connection;

    // Create a new container for each test
    container = new Container();
    container.bind(Types.TokenModel).toConstantValue(Token);
    container.bind(Types.TokenRepository).to(TokenRepositoryMongo);

    tokenRepository = container.get<TokenRepositoryMongo>(Types.TokenRepository);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoContainer.stop();
  });

  beforeEach(async () => {
    if (connection && connection.db) {
      await connection.db.dropCollection('tokens').catch(() => {
      });
    }
  });

  describe('create', () => {
    it('should create a new token and return a GetTokenDTO', async () => {
      // Arrange
      const createTokenDTO = generateTokenDTO();

      // Act
      const result = await tokenRepository.create(createTokenDTO);

      // Assert
      expect(result).toBeDefined();
      expect(result.userId).toEqual(createTokenDTO.userId);
      expect(result.token).toEqual(createTokenDTO.token);
      expect(result.type).toEqual(createTokenDTO.type);
      expect(result.isRevoked).toBe(false);
      expect(result.id).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should return a token when found by id', async () => {
      // Arrange
      const createTokenDTO = generateTokenDTO();
      const createdToken = await tokenRepository.create(createTokenDTO);
      const tokenId = createdToken.id;

      expect(tokenId).toBeDefined();

      // Act
      const result = await tokenRepository.findById(tokenId!);

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toEqual(tokenId);
    });

    it('should return undefined when token is not found by id', async () => {
      // Act
      const result = await tokenRepository.findById(uuidv4());

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('findByUserId', () => {
    it('should return tokens for a specific user', async () => {
      // Arrange
      const userId = uuidv4();
      await tokenRepository.create(generateTokenDTO({ userId }));
      await tokenRepository.create(generateTokenDTO({ userId }));
      await tokenRepository.create(generateTokenDTO()); // Different user's token

      // Act
      const results = await tokenRepository.findByUserId(userId);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].userId).toEqual(userId);
      expect(results[1].userId).toEqual(userId);
    });

    it('should not return revoked or expired tokens', async () => {
      // Arrange
      const userId = uuidv4();
      await tokenRepository.create(generateTokenDTO({
        userId,
        isRevoked: true
      }));
      await tokenRepository.create(generateTokenDTO({
        userId,
        expiresAt: faker.date.past()
      }));
      const validToken = await tokenRepository.create(generateTokenDTO({ userId }));

      // Act
      const results = await tokenRepository.findByUserId(userId);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].id).toEqual(validToken.id);
    });
  });

  describe('findByToken', () => {
    it('should return a token when found by token string', async () => {
      // Arrange
      const tokenString = faker.string.alphanumeric(32);
      const createTokenDTO = generateTokenDTO({ token: tokenString });
      await tokenRepository.create(createTokenDTO);

      // Act
      const result = await tokenRepository.findByToken(tokenString);

      // Assert
      expect(result).toBeDefined();
      expect(result?.token).toEqual(tokenString);
      expect(result?.userId).toEqual(createTokenDTO.userId);
    });

    it('should return undefined when token is not found by token string', async () => {
      // Act
      const result = await tokenRepository.findByToken('non-existent-token');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update token properties', async () => {
      // Arrange
      const token = await tokenRepository.create(generateTokenDTO());
      const updateData = {
        isRevoked: true,
        expiresAt: faker.date.future(),
        hasAtLeastOneField: function() {
          return true;
        }
      };

      // Act
      const result = await tokenRepository.update(token.id!, updateData);

      // Assert
      expect(result.isRevoked).toBe(true);
      expect(result.expiresAt).toEqual(updateData.expiresAt);
    });
  });

  describe('revoke', () => {
    it('should revoke a token', async () => {
      // Arrange
      const token = await tokenRepository.create(generateTokenDTO());

      // Act
      const result = await tokenRepository.revoke(token.id!);

      // Assert
      expect(result.isRevoked).toBe(true);
      expect(result.id).toEqual(token.id);
    });
  });

  describe('removeExpired', () => {
    it('should remove expired and revoked tokens', async () => {
      // Arrange
      await tokenRepository.create(generateTokenDTO({
        expiresAt: faker.date.past()
      }));
      await tokenRepository.create(generateTokenDTO({
        isRevoked: true
      }));
      await tokenRepository.create(generateTokenDTO()); // Valid token

      // Act
      const deletedCount = await tokenRepository.removeExpired();

      // Assert
      expect(deletedCount).toBe(2);
      const remainingTokens = await Token.countDocuments();
      expect(remainingTokens).toBe(1);
    });
  });

  describe('delete', () => {
    it('should delete a token', async () => {
      // Arrange
      const token = await tokenRepository.create(generateTokenDTO());

      // Act
      await tokenRepository.delete(token.id!);

      // Assert
      const result = await tokenRepository.findById(token.id!);
      expect(result).toBeUndefined();
    });
  });
});
