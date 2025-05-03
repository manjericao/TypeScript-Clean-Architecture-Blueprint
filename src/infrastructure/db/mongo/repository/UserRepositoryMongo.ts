import { inject, injectable } from 'inversify';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { IUserRepository } from '@application/contracts/domain/repositories';
import { CreateUserDTO, UpdateUserDTO } from '@enterprise/dto/input/user';
import { UserWithPasswordDTO } from '@enterprise/dto/internal';
import { PaginationDTO, UserResponseDTO } from '@enterprise/dto/output';
import { MongoUserMapper } from '@infrastructure/db/mongo/mapper';
import { IUserDocument } from '@infrastructure/db/mongo/models';
import { Types } from '@interface/types';

@injectable()
export class UserRepositoryMongo implements IUserRepository {
  constructor(@inject(Types.UserModel) private readonly userModel: mongoose.Model<IUserDocument>) {}

  async create(createUserDTO: CreateUserDTO): Promise<UserResponseDTO> {
    const userId = uuidv4();

    const userDocument = new this.userModel({
      id: userId,
      ...createUserDTO
    });

    const savedUser = await userDocument.save();
    return MongoUserMapper.toDTO(savedUser);
  }

  async findByEmail(email: string): Promise<UserResponseDTO | undefined> {
    const user = await this.userModel.findOne({ email });
    return user ? MongoUserMapper.toDTO(user) : undefined;
  }

  async findById(id: string): Promise<UserResponseDTO | undefined> {
    const user = await this.userModel.findOne({ id });
    return user ? MongoUserMapper.toDTO(user) : undefined;
  }

  async findByUsername(username: string): Promise<UserResponseDTO | undefined> {
    const user = await this.userModel.findOne({ username });
    return user ? MongoUserMapper.toDTO(user) : undefined;
  }

  async findByEmailWithPassword(email: string): Promise<UserWithPasswordDTO | undefined> {
    const user = await this.userModel.findOne({ email }).lean();

    if (!user) {
      return undefined;
    }

    return {
      id: user.id,
      email: user.email,
      password: user.password,
      role: user.role,
      isVerified: user.isVerified || false
    };
  }

  async findAll(page: number, limit: number): Promise<PaginationDTO<UserResponseDTO>> {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userModel.find().skip(skip).limit(limit).lean(),
      this.userModel.countDocuments()
    ]);

    const last_page = Math.ceil(total / limit);

    return {
      body: users.map((user) => MongoUserMapper.toDTO(user)),
      page,
      limit,
      total,
      last_page
    };
  }

  async update(id: string, data: UpdateUserDTO): Promise<UserResponseDTO> {
    const updatedUser = await this.userModel.findOneAndUpdate(
      { id },
      MongoUserMapper.toPersistence(data),
      { new: true }
    );

    return MongoUserMapper.toDTO(updatedUser!);
  }

  async delete(id: string): Promise<void> {
    await this.userModel.deleteOne({ id });
  }
}
