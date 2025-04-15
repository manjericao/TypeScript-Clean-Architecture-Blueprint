import { IsEmail, IsNotEmpty, IsEnum, IsOptional, IsBoolean, IsDate } from 'class-validator';
import { Exclude, Expose } from 'class-transformer';
import { UserRole, Gender } from '@enterprise/enum';

export interface IUser {
  id?: string;
  name: string;
  email: string;
  username: string;
  password: string;
  role: UserRole;
  birthDate?: Date;
  gender?: Gender;
  isVerified: boolean;
}

export class User implements IUser {
  @Expose()
  id?: string;

  @Expose()
  @IsNotEmpty()
  name!: string;

  @Expose()
  @IsEmail()
  email!: string;

  @Expose()
  @IsNotEmpty()
  username!: string;

  @Exclude()
  @IsNotEmpty()
  password!: string;

  @Expose()
  @IsEnum(UserRole)
  role!: UserRole;

  @Expose()
  @IsOptional()
  @IsDate()
  birthDate?: Date;

  @Expose()
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @Expose()
  @IsBoolean()
  isVerified!: boolean;

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}

/**
 * @openapi
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - username
 *         - password
 *         - repeat_password
 *         - role
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the user.
 *         email:
 *           type: string
 *           format: email
 *           description: Email of the user.
 *         username:
 *           type: string
 *           description: Username of the user.
 *         password:
 *           type: string
 *           format: password
 *           description: Password of the user.
 *         repeat_password:
 *           type: string
 *           format: password
 *           description: Repeat the password for validation.
 *         role:
 *           type: string
 *           enum: [ADMIN, USER]
 *           description: Type of the user to use the platform.
 *         birthDate:
 *           type: string
 *           format: date-time
 *           description: Birth date of the user.
 *         gender:
 *           type: string
 *           enum: [MALE, FEMALE, NON-BINARY]
 *           description: Gender of the user.
 *       example:
 *         name: Carlos
 *         email: carlos@test.com.br
 *         username: carlos
 *         password: Temporary@123
 *         repeat_password: Temporary@123
 *         role: ADMIN
 *         birthDate: 2012-04-23T18:25:43.511Z
 *         gender: MALE
 */
