import status from 'http-status';

import { IEmailService } from '@application/contracts/communication/email';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import {
  IJWTTokenGenerator,
  ITokenBlackList,
  ITokenGenerator
} from '@application/contracts/security/authentication';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import {
  ForgotPassword,
  LoginUser,
  LogoutUser,
  VerifyEmail,
  ResetPassword
} from '@application/use_cases/auth';
import { SendEmailOnUserCreation } from '@application/use_cases/notification';
import {
  AuthenticateUserDTO,
  EmailUserDTO,
  LogoutRequestDTO,
  ResetPasswordDTO
} from '@enterprise/dto/input/auth';
import { TokenInputDTO } from '@enterprise/dto/input/token';
import {
  ControllerMethod,
  HttpNext,
  HttpRequest,
  HttpResponse
} from '@interface/http/adapters/Http';
import { BaseController } from '@interface/http/controllers/base';

/**
 * Controller responsible for handling authentication-related operations.
 *
 * This class extends BaseController and implements methods for user authentication,
 * email verification, password reset, and other auth-related functionality.
 */
export class AuthController extends BaseController {
  /**
   * Constructor for initializing dependencies required for the authentication service.
   *
   * @param {IUserRepository} userRepository - The repository for managing user data.
   * @param {ITokenRepository} tokenRepository - The repository for managing token data.
   * @param {IJWTTokenGenerator} generateToken - The service for generating JWT tokens.
   * @param {ITokenGenerator} generateRefreshToken - The service for generating refresh tokens.
   * @param {IPasswordHasher} passwordHasher - The utility for hashing and verifying passwords.
   * @param {ILogger} logger - The service for logging information and errors.
   * @param {IConfig} config - The configuration service for accessing application settings.
   * @param {ITokenBlackList} tokenBlackList - The service for managing blocklisted tokens.
   * @param {IEmailService} emailService - The service for sending emails.
   */
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenRepository: ITokenRepository,
    private readonly generateToken: IJWTTokenGenerator,
    private readonly generateRefreshToken: ITokenGenerator,
    private readonly passwordHasher: IPasswordHasher,
    private readonly logger: ILogger,
    private readonly config: IConfig,
    private readonly tokenBlackList: ITokenBlackList,
    private readonly emailService: IEmailService
  ) {
    super();
  }

  /**
   * Creates a controller method for verifying user email addresses using tokens.
   *
   * @returns An object containing the _verifyEmail controller method
   */
  public verifyEmail(): { _verifyEmail: ControllerMethod } {
    return {
      _verifyEmail: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const tokenParam = request.query?.token;
            let token: string | undefined;

            if (typeof tokenParam === 'string') {
              token = tokenParam;
            } else if (Array.isArray(tokenParam) && tokenParam.length > 0) {
              token = String(tokenParam[0]);
            } else {
              token = undefined;
            }

            const tokenData = await TokenInputDTO.validate({ token });

            const verifyEmailCommand = new VerifyEmail(
              this.userRepository,
              this.tokenRepository,
              this.logger
            );

            verifyEmailCommand.on('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                {
                  message: 'Email verified successfully',
                  userId: result.userId
                },
                status.OK
              );
            });
            verifyEmailCommand.on('TOKEN_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            });
            verifyEmailCommand.on('USER_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            });
            verifyEmailCommand.on('TOKEN_EXPIRED', (error) => {
              this.handleValidationError(response, String(error));
            });
            verifyEmailCommand.on('ALREADY_VERIFIED', (result) => {
              this.handleSuccess(
                response,
                {
                  message: 'Email already verified',
                  userId: result.userId
                },
                status.OK
              );
            });
            verifyEmailCommand.on('ERROR', this.handleError(response));

            await verifyEmailCommand.execute(tokenData);
          },
          this.logger
        );
      }
    };
  }

  /**
   * Handles the login functionality for a user. Validates the user's credentials
   * and manages the appropriate response based on the outcome of the login attempt.
   *
   * @return A ControllerMethod object that manages the login functionality and returns a structured response
   *         based on the success or failure of the login attempt.
   */
  public login(): { _login: ControllerMethod } {
    return {
      _login: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const credentials = await AuthenticateUserDTO.validate(
              request.body as Record<string, unknown>
            );

            const loginUserCommand = new LoginUser(
              this.userRepository,
              this.passwordHasher,
              this.generateToken,
              this.config,
              this.logger
            );

            loginUserCommand.on('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                {
                  userId: result.userId,
                  tokens: {
                    access: {
                      token: result.accessToken,
                      expires: result.accessTokenExpires
                    },
                    refresh: {
                      token: result.refreshToken,
                      expires: result.refreshTokenExpires
                    }
                  }
                },
                status.OK
              );
            });
            loginUserCommand.on('USER_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            });
            loginUserCommand.on('INVALID_CREDENTIALS', (error) => {
              this.handleUnauthorized(response, String(error));
            });
            loginUserCommand.on('ACCOUNT_NOT_VERIFIED', (error) => {
              this.handleForbidden(response, String(error));
            });
            loginUserCommand.on('ERROR', this.handleError(response));

            await loginUserCommand.execute(credentials);
          },
          this.logger
        );
      }
    };
  }

  /**
   * Handles the logout process for a user, including token validation and blocklisting.
   *
   * @return {Object} An object containing the `_logout` method, which manages the logout logic
   *                  by invalidating the provided access and refresh tokens.
   */
  public logout(): { _logout: ControllerMethod } {
    return {
      _logout: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const body = request.body as { refreshToken?: string } | undefined;
            const authHeader = request.headers?.authorization;

            let accessToken: string | undefined;
            if (authHeader?.startsWith('Bearer ')) {
              accessToken = authHeader.substring(7);
            }

            const refreshToken = body?.refreshToken;

            const logoutData = await LogoutRequestDTO.validate({
              accessToken,
              refreshToken
            });

            const logoutCommand = new LogoutUser(this.tokenBlackList, this.config, this.logger);

            logoutCommand.on('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                {
                  message: result.message
                },
                status.NO_CONTENT
              );
            });
            logoutCommand.on('INVALID_TOKEN', (error) => {
              this.handleValidationError(response, String(error));
            });
            logoutCommand.on('ERROR', this.handleError(response));

            await logoutCommand.execute(logoutData);
          },
          this.logger
        );
      }
    };
  }

  /**
   * Handles the forgot password process by validating the input email,
   * invoking the ForgotPassword use case, and managing the result through
   * event handlers for various scenarios.
   *
   * @return An object containing a method `_forgotPassword` which is an asynchronous controller method.
   */
  public forgotPassword(): { _forgotPassword: ControllerMethod } {
    return {
      _forgotPassword: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const forgotPasswordData = await EmailUserDTO.validate(
              request.body as Record<string, unknown>
            );

            const forgotPasswordCommand = new ForgotPassword(
              this.userRepository,
              this.tokenRepository,
              this.generateRefreshToken,
              this.config,
              this.logger
            );

            forgotPasswordCommand.on('SUCCESS', () => {
              this.handleSuccess(
                response,
                { message: 'Password reset instructions sent to your email' },
                status.OK
              );
            });
            forgotPasswordCommand.on('USER_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            });
            forgotPasswordCommand.on('ACCOUNT_NOT_VERIFIED', (error) => {
              this.handleForbidden(response, String(error));
            });
            forgotPasswordCommand.on('ERROR', this.handleError(response));

            await forgotPasswordCommand.execute(forgotPasswordData);
          },
          this.logger
        );
      }
    };
  }

  /**
   * Handles the reset password functionality by processing the provided token and new password.
   * Validates the input, performs the reset operation, and sends appropriate responses.
   *
   * @return {Object} Returns an object containing the reset password controller method.
   */
  public resetPassword(): { _resetPassword: ControllerMethod } {
    return {
      _resetPassword: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const resetPasswordData = await ResetPasswordDTO.validate(
              request.body as Record<string, unknown>
            );

            const resetPasswordCommand = new ResetPassword(
              this.userRepository,
              this.tokenRepository,
              this.passwordHasher,
              this.logger
            );

            resetPasswordCommand.on('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                {
                  message: result.message
                },
                status.OK
              );
            });
            resetPasswordCommand.on('TOKEN_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            });
            resetPasswordCommand.on('TOKEN_EXPIRED', (error) => {
              this.handleValidationError(response, String(error));
            });
            resetPasswordCommand.on('INVALID_TOKEN', (error) => {
              this.handleValidationError(response, String(error));
            });
            resetPasswordCommand.on('ERROR', this.handleError(response));

            await resetPasswordCommand.execute(resetPasswordData);
          },
          this.logger
        );
      }
    };
  }

  /**
   * Sends a verification email when a new user is created.
   * This method orchestrates the execution of the `SendEmailOnUserCreation` use case.
   *
   * @return {Object} An object containing the `_sendEmailOnUserCreation` method handler.
   */
  public sendEmailOnUserCreation(): { _sendEmailOnUserCreation: ControllerMethod } {
    return {
      _sendEmailOnUserCreation: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: HttpNext
      ): Promise<void> => {
        await this.executeSafely(
          response,
          async () => {
            const emailUserDTO = await EmailUserDTO.validate(
              request.body as Record<string, unknown>
            );

            const sendEmailOnUserCreation = new SendEmailOnUserCreation(
              this.tokenRepository,
              this.userRepository,
              this.emailService,
              this.config,
              this.logger
            );

            sendEmailOnUserCreation.on('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                {
                  message: 'Verification email sent successfully',
                  email: result.email
                },
                status.OK
              );
            });
            sendEmailOnUserCreation.on('USER_ALREADY_VERIFIED', (data) => {
              this.handleSuccess(
                response,
                {
                  message: 'User is already verified',
                  email: data.email
                },
                status.OK
              );
            });
            sendEmailOnUserCreation.on('USER_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            });
            sendEmailOnUserCreation.on('AVAILABILITY_ERROR', (error) => {
              this.handleError(response)(error);
            });
            sendEmailOnUserCreation.on('ERROR', this.handleError(response));

            await sendEmailOnUserCreation.execute(emailUserDTO);
          },
          this.logger
        );
      }
    };
  }
}
