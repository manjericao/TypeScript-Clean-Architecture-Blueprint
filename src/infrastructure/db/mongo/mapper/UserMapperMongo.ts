import { IUserDocument } from '@infrastructure/db/mongo/models/UserMongo';
import { UserResponseDTO } from '@enterprise/dto/output/UserResponseDTO';
import { CreateUserDTO } from '@enterprise/dto/input/user/CreateUserDTO';
import { UpdateUserDTO } from '@enterprise/dto/input/user/UpdateUserDTO';

export class MongoUserMapper {
  static toDTO(doc: IUserDocument): UserResponseDTO {
    return {
      id: doc.id,
      name: doc.name,
      email: doc.email,
      username: doc.username,
      role: doc.role,
      birthDate: doc.birthDate,
      gender: doc.gender,
      isVerified: doc.isVerified
    };
  }

  static toPersistence(entity: CreateUserDTO | UpdateUserDTO): Partial<IUserDocument> {
    const persistenceObject: Partial<IUserDocument> = {};

    if ('name' in entity && entity.name) persistenceObject.name = entity.name;
    if ('email' in entity && entity.email) persistenceObject.email = entity.email;
    if ('username' in entity && entity.username) persistenceObject.username = entity.username;
    if ('password' in entity && entity.password) persistenceObject.password = entity.password;
    if ('role' in entity && entity.role) persistenceObject.role = entity.role;
    if ('birthDate' in entity && entity.birthDate) persistenceObject.birthDate = entity.birthDate;
    if ('gender' in entity && entity.gender) persistenceObject.gender = entity.gender;
    if ('isVerified' in entity) persistenceObject.isVerified = entity.isVerified;

    return persistenceObject;
  }
}
