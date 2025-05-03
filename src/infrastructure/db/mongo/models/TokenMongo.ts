import { Schema, model, Document } from 'mongoose';

import { IToken } from '@enterprise/entities';
import { TokenType } from '@enterprise/enum';

type ITokenWithoutId = Omit<IToken, 'id'>;

export interface ITokenDocument extends ITokenWithoutId, Document {
  id: string;
}

const TokenSchema = new Schema<ITokenDocument>(
  {
    id: {
      type: String,
      required: true,
      unique: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    token: {
      type: String,
      required: true,
      unique: true
    },
    type: {
      type: String,
      enum: Object.values(TokenType),
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    isRevoked: {
      type: Boolean,
      required: true,
      default: false,
      index: true
    }
  },
  { timestamps: true }
);

TokenSchema.index({ userId: 1, type: 1, isRevoked: 1 });
TokenSchema.index({ expiresAt: 1, isRevoked: 1 });

TokenSchema.statics.removeExpiredTokens = function () {
  const now = new Date();
  return this.deleteMany({
    $or: [{ expiresAt: { $lt: now } }, { isRevoked: true }]
  });
};

export const Token = model<ITokenDocument>('Token', TokenSchema);
