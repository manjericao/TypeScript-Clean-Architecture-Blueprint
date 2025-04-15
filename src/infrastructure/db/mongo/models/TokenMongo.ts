import { Schema, model, Document } from 'mongoose';
import { TokenType } from '@enterprise/enum';
import { IToken } from '@enterprise/entities';

type ITokenWithoutId = Omit<IToken, 'id'>;

// Create the document interface
export interface ITokenDocument extends ITokenWithoutId, Document {
  id: string;
}

// Define the schema
const TokenSchema = new Schema<ITokenDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: String,
    required: true,
    index: true, // Add index for faster queries by userId
  },
  token: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: String,
    enum: Object.values(TokenType),
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true, // Add index for faster expiration queries
  },
  isRevoked: {
    type: Boolean,
    required: true,
    default: false,
    index: true, // Add index for faster revocation checks
  }
}, { timestamps: true });

// Create compound indexes
TokenSchema.index({ userId: 1, type: 1, isRevoked: 1 });
TokenSchema.index({ expiresAt: 1, isRevoked: 1 });

// Add automatic cleanup of expired tokens
TokenSchema.statics.removeExpiredTokens = function() {
  const now = new Date();
  return this.deleteMany({
    $or: [
      { expiresAt: { $lt: now } },
      { isRevoked: true }
    ]
  });
};

export const Token = model<ITokenDocument>('Token', TokenSchema);
