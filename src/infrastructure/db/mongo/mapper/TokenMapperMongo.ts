import { ITokenDocument } from '@infrastructure/db/mongo/models';
import { CreateTokenDTO, UpdateTokenDTO } from '@enterprise/dto/input/token';
import { TokenResponseDTO } from '@enterprise/dto/output';

export class MongoTokenMapper {
  static toDTO(doc: ITokenDocument): TokenResponseDTO {
    return {
      id: doc.id,
      userId: doc.userId,
      token: doc.token,
      type: doc.type,
      expiresAt: doc.expiresAt,
      isRevoked: doc.isRevoked,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,

      /**
       * Checks if the token has expired
       *
       * @returns True if the token has expired, false otherwise
       */
      isExpired(): boolean {
        return new Date() > this.expiresAt;
      },

      /**
       * Checks if the token is valid (not expired and not revoked)
       *
       * @returns True if the token is valid, false otherwise
       */
      isValid(): boolean {
        return !this.isExpired() && !this.isRevoked;
      }
    };
  }

  static toPersistence(entity: CreateTokenDTO | UpdateTokenDTO): Partial<ITokenDocument> {
    const persistenceObject: Partial<ITokenDocument> = {};

    if ('userId' in entity && entity.userId) persistenceObject.userId = entity.userId;
    if ('token' in entity && entity.token) persistenceObject.token = entity.token;
    if ('type' in entity && entity.type) persistenceObject.type = entity.type;
    if ('expiresAt' in entity) persistenceObject.expiresAt = entity.expiresAt;
    if ('isRevoked' in entity) persistenceObject.isRevoked = entity.isRevoked;

    return persistenceObject;
  }
}
