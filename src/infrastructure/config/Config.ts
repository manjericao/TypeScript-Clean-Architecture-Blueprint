import * as dotenvSafe from 'dotenv-safe';
import { injectable } from 'inversify';
import path from 'path';
import { IConfig } from '@application/contracts/infrastructure';

@injectable()
export class Config implements IConfig {
  private readonly config: NodeJS.ProcessEnv;

  constructor() {
    this.config = dotenvSafe.config({
      allowEmptyValues: true,
      example: path.join(__dirname, '../../../.env.example'),
      path: path.join(__dirname, '../../../.env'),
    }).parsed || {};
  }

  readonly env: string = process.env.NODE_ENV || 'development';
  readonly MONGOOSE_DEBUG: boolean = process.env.MONGOOSE_DEBUG === 'true';

  readonly jwt = {
    secret: process.env.JWT_SECRET || 'thisisasamplesecret',
    accessExpirationMinutes: parseInt(process.env.JWT_ACCESS_EXPIRATION_MINUTES || '30', 10),
    refreshExpirationDays: parseInt(process.env.JWT_REFRESH_EXPIRATION_DAYS || '30', 10),
    resetPasswordExpirationMinutes: parseInt(process.env.JWT_RESET_PASSWORD_EXPIRATION_MINUTES || '10', 10),
    verifyEmailExpirationMinutes: parseInt(process.env.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES || '10', 10),
  };

  readonly db: string = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/ppl-api';
  readonly db_config = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  };

  readonly storage = {
    type: process.env.STORAGE_TYPE || 'local',
    aws: {
      bucketName: process.env.BUCKET_NAME,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_DEFAULT_REGION,
    },
  };

  readonly server = {
    protocol: process.env.PROTOCOL || 'http',
    host: process.env.HOST || 'localhost',
    port: parseInt(process.env.PORT || '3000', 10),
    version: process.env.VERSION || 'v1',
  };

  readonly smtp = {
    host: process.env.SMTP_HOST || 'email-server',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    debug: this.env === 'development',
    username: process.env.SMTP_USERNAME || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'support@yourapp.com',
  };

  readonly redis = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10),
  };
}
