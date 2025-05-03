import { Container } from 'inversify';
import mongoose from 'mongoose';

import { IEmailService } from '@application/contracts/communication/email';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { IConfig, IDatabase, ILogger, IMiddleware } from '@application/contracts/infrastructure';
import { IBootstrapper } from '@application/contracts/lifecycle';
import {
  IJWTTokenGenerator,
  ITokenBlackList,
  ITokenGenerator
} from '@application/contracts/security/authentication';
import { IAuthorizationMiddleware } from '@application/contracts/security/authorization';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import {
  SendEmailOnForgotPassword,
  SendEmailOnUserCreation
} from '@application/use_cases/notification';
import {
  CreateTokenOnUserCreation,
  DeleteTokensOnUserDeletion
} from '@application/use_cases/token';
import { Config } from '@infrastructure/config';
import { RedisConnection } from '@infrastructure/db/redis/redisdb';
import { WinstonLogger } from '@infrastructure/logger';
import { EmailService } from '@infrastructure/services/email';
import { PasswordHasher } from '@infrastructure/services/password';
import {
  VerificationTokenGenerator,
  JWTTokenGenerator,
  TokenBlackList
} from '@infrastructure/services/token';
import { BaseTransformer } from '@infrastructure/services/transformer';
import { RouterFactory } from '@infrastructure/web';
import { SwaggerOptionsProvider } from '@infrastructure/web/docs';
import {
  AuthMiddleware,
  LoggingMiddleware,
  SwaggerMiddleware,
  ErrorMiddleware,
  IAuthMiddleware
} from '@infrastructure/web/middleware';
import { AuthorizationMiddleware } from '@infrastructure/web/middleware/AuthorizationMiddleware';
import { UserModule, AuthModule } from '@infrastructure/web/routes';
import { AuthController } from '@interface/http/controllers/auth';
import { UserController } from '@interface/http/controllers/user';
import { Types } from '@interface/types';
import { ITransformer } from 'src/application/contracts/transformer';
import {
  User as UserModel,
  IUserDocument,
  Token as TokenModel,
  ITokenDocument
} from 'src/infrastructure/db/mongo/models';
import { MongoDBConnection } from 'src/infrastructure/db/mongo/mongodb';
import { UserRepositoryMongo, TokenRepositoryMongo } from 'src/infrastructure/db/mongo/repository';

const container = new Container();

// Core bindings
container.bind<IConfig>(Types.Config).to(Config).inSingletonScope();
container.bind<ILogger>(Types.Logger).to(WinstonLogger).inSingletonScope();
container.bind<IDatabase>(Types.Database).to(MongoDBConnection).inSingletonScope();
container.bind<IDatabase>(Types.RedisConnection).to(RedisConnection).inSingletonScope();

// Swagger bindings
container.bind<SwaggerOptionsProvider>(Types.SwaggerOptionsProvider).to(SwaggerOptionsProvider);
container.bind<SwaggerMiddleware>(Types.SwaggerMiddleware).to(SwaggerMiddleware);

// Middleware bindings
container.bind<IAuthMiddleware>(Types.AuthMiddleware).to(AuthMiddleware).inSingletonScope();
container.bind<IMiddleware>(Types.LoggingMiddleware).to(LoggingMiddleware).inSingletonScope();
container.bind<IMiddleware>(Types.ErrorMiddleware).to(ErrorMiddleware).inSingletonScope();
container
  .bind<IAuthorizationMiddleware>(Types.AuthorizationMiddleware)
  .to(AuthorizationMiddleware)
  .inSingletonScope();

// Services bindings
container.bind<ITransformer>(Types.Transformer).to(BaseTransformer).inSingletonScope();
container.bind<IPasswordHasher>(Types.PasswordHasher).to(PasswordHasher).inSingletonScope();
container
  .bind<ITokenGenerator>(Types.VerificationTokenGenerator)
  .to(VerificationTokenGenerator)
  .inSingletonScope();
container
  .bind<IJWTTokenGenerator>(Types.JWTTokenGenerator)
  .to(JWTTokenGenerator)
  .inSingletonScope();
container.bind<IEmailService>(Types.EmailService).to(EmailService).inSingletonScope();
container.bind<ITokenBlackList>(Types.TokenBlackList).to(TokenBlackList);

// User Module bindings
container.bind<UserModule>(Types.UserModule).to(UserModule);
container
  .bind<UserController>(Types.UserController)
  .toDynamicValue(() => {
    const userRepository = container.get<IUserRepository>(Types.UserRepository);
    const transformer = container.get<ITransformer>(Types.Transformer);
    const passwordHasher = container.get<IPasswordHasher>(Types.PasswordHasher);
    const logger = container.get<ILogger>(Types.Logger);

    return new UserController(userRepository, transformer, passwordHasher, logger);
  })
  .inSingletonScope();
container.bind<IUserRepository>(Types.UserRepository).to(UserRepositoryMongo);
container.bind<mongoose.Model<IUserDocument>>(Types.UserModel).toConstantValue(UserModel);

// Token Module bindings
container.bind<ITokenRepository>(Types.TokenRepository).to(TokenRepositoryMongo);
container.bind<mongoose.Model<ITokenDocument>>(Types.TokenModel).toConstantValue(TokenModel);
container.bind<CreateTokenOnUserCreation>(Types.CreateTokenOnUserCreation).toDynamicValue(() => {
  const tokenRepository = container.get<ITokenRepository>(Types.TokenRepository);
  const generateToken = container.get<ITokenGenerator>(Types.VerificationTokenGenerator);
  const config = container.get<IConfig>(Types.Config);
  const logger = container.get<ILogger>(Types.Logger);

  return new CreateTokenOnUserCreation(tokenRepository, generateToken, config, logger);
});
container.bind<DeleteTokensOnUserDeletion>(Types.DeleteTokensOnUserDeletion).toDynamicValue(() => {
  const tokenRepository = container.get<ITokenRepository>(Types.TokenRepository);
  const logger = container.get<ILogger>(Types.Logger);

  return new DeleteTokensOnUserDeletion(tokenRepository, logger);
});

// Notification Module bindings
container
  .bind<SendEmailOnUserCreation>(Types.SendEmailOnUserCreation)
  .toDynamicValue(() => {
    const tokenRepository = container.get<ITokenRepository>(Types.TokenRepository);
    const userRepository = container.get<IUserRepository>(Types.UserRepository);
    const emailService = container.get<IEmailService>(Types.EmailService);
    const config = container.get<IConfig>(Types.Config);
    const logger = container.get<ILogger>(Types.Logger);

    return new SendEmailOnUserCreation(
      tokenRepository,
      userRepository,
      emailService,
      config,
      logger
    );
  })
  .inSingletonScope();
container
  .bind<SendEmailOnForgotPassword>(Types.SendEmailOnForgotPassword)
  .toDynamicValue(() => {
    const emailService = container.get<IEmailService>(Types.EmailService);
    const config = container.get<IConfig>(Types.Config);
    const logger = container.get<ILogger>(Types.Logger);

    return new SendEmailOnForgotPassword(emailService, config, logger);
  })
  .inSingletonScope();

// Auth Module bindings
container.bind<AuthModule>(Types.AuthModule).to(AuthModule);
container
  .bind<AuthController>(Types.AuthController)
  .toDynamicValue(() => {
    const userRepository = container.get<IUserRepository>(Types.UserRepository);
    const tokenRepository = container.get<ITokenRepository>(Types.TokenRepository);
    const generateToken = container.get<IJWTTokenGenerator>(Types.JWTTokenGenerator);
    const generateRefreshToken = container.get<ITokenGenerator>(Types.VerificationTokenGenerator);
    const passwordHasher = container.get<IPasswordHasher>(Types.PasswordHasher);
    const logger = container.get<ILogger>(Types.Logger);
    const config = container.get<IConfig>(Types.Config);
    const tokenBlackList = container.get<ITokenBlackList>(Types.TokenBlackList);
    const emailService = container.get<IEmailService>(Types.EmailService);

    return new AuthController(
      userRepository,
      tokenRepository,
      generateToken,
      generateRefreshToken,
      passwordHasher,
      logger,
      config,
      tokenBlackList,
      emailService
    );
  })
  .inSingletonScope();

// Bootstrap Eagerly Modules for Pub/Sub
container
  .bind<IBootstrapper>(Types.Bootstrapper)
  .toDynamicValue(() => container.get<CreateTokenOnUserCreation>(Types.CreateTokenOnUserCreation));
container
  .bind<IBootstrapper>(Types.Bootstrapper)
  .toDynamicValue(() =>
    container.get<DeleteTokensOnUserDeletion>(Types.DeleteTokensOnUserDeletion)
  );
container
  .bind<IBootstrapper>(Types.Bootstrapper)
  .toDynamicValue(() => container.get<SendEmailOnUserCreation>(Types.SendEmailOnUserCreation));
container
  .bind<IBootstrapper>(Types.Bootstrapper)
  .toDynamicValue(() => container.get<SendEmailOnForgotPassword>(Types.SendEmailOnForgotPassword));

// Router bindings
container.bind<RouterFactory>(Types.RouterFactory).to(RouterFactory);

export { container };
