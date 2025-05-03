import { inject, injectable } from 'inversify';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { ITokenRepository } from '@application/contracts/domain/repositories';
import { CreateTokenDTO, UpdateTokenDTO } from '@enterprise/dto/input/token';
import { TokenResponseDTO } from '@enterprise/dto/output';
import { MongoTokenMapper } from '@infrastructure/db/mongo/mapper';
import { ITokenDocument } from '@infrastructure/db/mongo/models';
import { Types } from '@interface/types';

@injectable()
export class TokenRepositoryMongo implements ITokenRepository {
  constructor(
    @inject(Types.TokenModel) private readonly tokenModel: mongoose.Model<ITokenDocument>
  ) {}

  async create(data: CreateTokenDTO): Promise<TokenResponseDTO> {
    const tokenId = uuidv4();

    const tokenDocument = new this.tokenModel({
      id: tokenId,
      ...data
    });

    const savedToken = await tokenDocument.save();
    return MongoTokenMapper.toDTO(savedToken);
  }

  async findById(id: string): Promise<TokenResponseDTO | undefined> {
    const token = await this.tokenModel.findOne({ id });
    return token ? MongoTokenMapper.toDTO(token) : undefined;
  }

  async findByUserId(userId: string): Promise<TokenResponseDTO[]> {
    const tokens = await this.tokenModel.find({
      userId,
      isRevoked: false,
      expiresAt: { $gt: new Date() }
    });

    return tokens.map((token) => MongoTokenMapper.toDTO(token));
  }

  async findByToken(token: string): Promise<TokenResponseDTO | undefined> {
    const tokenDoc = await this.tokenModel.findOne({ token });
    return tokenDoc ? MongoTokenMapper.toDTO(tokenDoc) : undefined;
  }

  async update(id: string, data: UpdateTokenDTO): Promise<TokenResponseDTO> {
    const updatedToken = await this.tokenModel.findOneAndUpdate(
      { id },
      MongoTokenMapper.toPersistence(data),
      { new: true }
    );

    return MongoTokenMapper.toDTO(updatedToken!);
  }

  async revoke(id: string): Promise<TokenResponseDTO> {
    const revokedToken = await this.tokenModel.findOneAndUpdate(
      { id },
      { isRevoked: true },
      { new: true }
    );

    return MongoTokenMapper.toDTO(revokedToken!);
  }

  async delete(id: string): Promise<void> {
    await this.tokenModel.deleteOne({ id });
  }

  async removeExpired(): Promise<number> {
    const result = await this.tokenModel.deleteMany({
      $or: [{ expiresAt: { $lt: new Date() } }, { isRevoked: true }]
    });

    return result.deletedCount;
  }
}
