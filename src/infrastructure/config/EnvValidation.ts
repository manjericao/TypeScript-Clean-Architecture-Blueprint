// src/infrastructure/config/env.validation.ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  MONGODB_URL: z.string(),
  MONGOOSE_DEBUG: z.string().transform((val) => val === 'true'),

  STORAGE_TYPE: z.enum(['s3', 'local']).optional(),

  JWT_SECRET: z.string(),
  JWT_ACCESS_EXPIRATION_MINUTES: z.string().transform(Number),
  JWT_REFRESH_EXPIRATION_DAYS: z.string().transform(Number),
  JWT_RESET_PASSWORD_EXPIRATION_MINUTES: z.string().transform(Number),
  JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: z.string().transform(Number),

  SMTP_HOST: z.string(),
  SMTP_PORT: z.string().transform(Number),
  SMTP_USERNAME: z.string(),
  SMTP_PASSWORD: z.string(),
  EMAIL_FROM: z.string().email(),

  BUCKET_NAME: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_DEFAULT_REGION: z.string().optional(),
});

export type EnvVars = z.infer<typeof envSchema>;
