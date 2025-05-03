import { Schema, model, Document } from 'mongoose';

import { IUser } from '@enterprise/entities/UserModel';
import { UserRole, Gender } from '@enterprise/enum';

type IUserWithoutId = Omit<IUser, 'id'>;

export interface IUserDocument extends IUserWithoutId, Document {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDocument>(
  {
    id: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true,
      unique: true
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    username: {
      type: String,
      required: true,
      unique: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true
    },
    birthDate: {
      type: Date
    },
    gender: {
      type: String,
      enum: Object.values(Gender)
    },
    isVerified: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

export const User = model<IUserDocument>('User', UserSchema);
