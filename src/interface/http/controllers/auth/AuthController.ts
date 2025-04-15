import status from 'http-status';
import { BaseController } from '@interface/http/controllers/base';
import { ForgotPassword, LoginUser, LogoutUser, VerifyEmail, ResetPassword } from '@application/use_cases/auth';
import { ControllerMethod, HttpNext, HttpRequest, HttpResponse } from '@interface/http/types/Http';
import { SendEmailOnUserCreation } from '@application/use_cases/notification';
import { AuthenticateUserDTO, EmailUserDTO, LogoutRequestDTO, ResetPasswordDTO } from '@enterprise/dto/input/auth';
import { DTOValidationError } from '@enterprise/dto/errors';
import { IJWTTokenGenerator, ITokenBlackList, ITokenGenerator } from '@application/contracts/security/authentication';
import { IPasswordHasher } from '@application/contracts/security/encryption';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { IEmailService } from '@application/contracts/communication/email';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

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
   * @param {ITokenBlackList} tokenBlackList - The service for managing blacklisted tokens.
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
        next: HttpNext
      ): Promise<void> => {
        try {
          const tokenParam = request.query?.token;
          let token: string | undefined;

          if (typeof tokenParam === 'string') {
            token = tokenParam;
          } else if (Array.isArray(tokenParam) && tokenParam.length > 0) {
            token = String(tokenParam[0]);
          } else {
            token = undefined;
          }

          if (!token) {
            this.handleValidationError(
              response,
              'Verification token is required'
            );
            return;
          }

          const verifyEmailCommand = new VerifyEmail(
            this.userRepository,
            this.tokenRepository,
            this.logger
          );

          verifyEmailCommand
            .onTyped('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                {
                  message: 'Email verified successfully',
                  userId: result.userId
                },
                status.OK
              );
            })
            .onTyped('TOKEN_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            })
            .onTyped('USER_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            })
            .onTyped('TOKEN_EXPIRED', (error) => {
              this.handleValidationError(response, String(error));
            })
            .onTyped('ALREADY_VERIFIED', (result) => {
              this.handleSuccess(
                response,
                {
                  message: 'Email already verified',
                  userId: result.userId
                },
                status.OK
              );
            })
            .onTyped('ERROR', this.handleError(response));

          await verifyEmailCommand.execute(token);
        } catch (error: unknown) {
          const typedError = error as Error & { statusCode?: number };
          if (typedError.statusCode === status.BAD_REQUEST ||
            typedError.statusCode === status.UNPROCESSABLE_ENTITY) {
            this.handleValidationError(response, typedError.message);
            return;
          }
          this.logger.error('Unexpected error in verify email', { error });
          this.handleError(response)(error);
        }
      },
    };
  }

  /**
   * Handles the login functionality for a user. Validates the user's credentials
   * and manages the appropriate response based on the outcome of the login attempt.
   *
   * The method performs the following operations:
   * - Validates the presence of required fields (email and password).
   * - Executes the login use case with dependencies such as user repository, password hasher,
   *   token generator, config, and logger.
   * - Handles various outcomes of the login process including success, invalid credentials,
   *   unverified accounts, and errors.
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
        next: HttpNext
      ): Promise<void> => {
        try {
          const { email, password } = request.body as { email?: string; password?: string };

          const credentials = await AuthenticateUserDTO.validate({
            email,
            password
          });

          const loginUserCommand = new LoginUser(
            this.userRepository,
            this.passwordHasher,
            this.generateToken,
            this.config,
            this.logger
          );

          loginUserCommand
            .onTyped('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                {
                  userId: result.userId,
                  tokens: {
                    access: {
                      token: result.accessToken,
                      expires: result.accessTokenExpires,
                    },
                    refresh: {
                      token: result.refreshToken,
                      expires: result.refreshTokenExpires,
                    },
                  }
                },
                status.OK
              );
            })
            .onTyped('USER_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            })
            .onTyped('INVALID_CREDENTIALS', (error) => {
              this.handleUnauthorized(response, String(error));
            })
            .onTyped('ACCOUNT_NOT_VERIFIED', (error) => {
              this.handleForbidden(response, String(error));
            })
            .onTyped('ERROR', this.handleError(response));

          await loginUserCommand.execute(credentials);
        } catch (error: unknown) {
          if (error instanceof DTOValidationError) {
            this.handleValidationError(response, error.getFormattedErrors());
          }

          this.logger.error('Unexpected error in login', { error });
          this.handleError(response)(error);
        }
      }
    };
  }

  /**
   * Handles the logout process for a user, including token validation and blacklisting.
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
        next: HttpNext
      ): Promise<void> => {
        try {
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

          const logoutCommand = new LogoutUser(
            this.tokenBlackList,
            this.config,
            this.logger
          );

          logoutCommand
            .onTyped('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                {
                  message: result.message
                },
                status.NO_CONTENT
              );
            })
            .onTyped('INVALID_TOKEN', (error) => {
              this.handleValidationError(response, String(error));
            })
            .onTyped('ERROR', this.handleError(response));

          await logoutCommand.execute(logoutData);
        } catch (error) {
          if (error instanceof DTOValidationError) {
            this.handleValidationError(response, error.getFormattedErrors());
          }

          this.logger.error('Unexpected error in logout user', { error });
          this.handleError(response)(error);
        }
      }
    };
  }

  /**
   * Handles the forgot password process by validating the input email,
   * invoking the ForgotPassword use case, and managing the result through
   * event handlers for various scenarios such as success, user not found,
   * or account not verified.
   *
   * @return An object containing a method `_forgotPassword` which is an asynchronous controller method.
   *         The method processes the forget password request, interacts with necessary use cases,
   *         and handles different response outcomes effectively.
   */
  public forgotPassword(): { _forgotPassword: ControllerMethod } {
    return {
      _forgotPassword: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        next: HttpNext
      ): Promise<void> => {
        try {
          const { email } = request.body as { email: string; };

          const forgotPasswordData = await EmailUserDTO.validate({ email });

          const forgotPasswordCommand = new ForgotPassword(
            this.userRepository,
            this.tokenRepository,
            this.generateRefreshToken,
            this.config,
            this.logger
          );

          // Set up event handlers following the pattern in other methods
          forgotPasswordCommand
            .onTyped('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                { message: result.message },
                status.OK
              );
            })
            .onTyped('USER_NOT_FOUND', (error) => {
              this.handleNotFound(
                response,
                String(error)
              );
            })
            .onTyped('ACCOUNT_NOT_VERIFIED', (error) => {
              this.handleForbidden(
                response,
                String(error)
              );
            })
            .onTyped('ERROR', this.handleError(response));

          await forgotPasswordCommand.execute(forgotPasswordData);
        } catch (error) {
          if (error instanceof DTOValidationError) {
            this.handleValidationError(response, error.getFormattedErrors());
          }

          this.logger.error('Unexpected error in forgot password', { error });
          this.handleError(response)(error);
        }
      }
    };
  }

  /**
   * Handles the reset password functionality by processing the provided token and new password.
   * Validates the input, performs the reset operation using the `ResetPassword` command,
   * and sends appropriate responses based on the outcome.
   *
   * @return {Object} Returns an object containing the reset password controller method `_resetPassword`.
   */
  public resetPassword(): { _resetPassword: ControllerMethod } {
    return {
      _resetPassword: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        next: HttpNext
      ): Promise<void> => {
        try {
          const body = request.body as { token: string; password: string; };
          const { token, password } = body;

          const resetPasswordData = await ResetPasswordDTO.validate({ token, newPassword: password });

          const resetPasswordCommand = new ResetPassword(
            this.userRepository,
            this.tokenRepository,
            this.passwordHasher,
            this.logger
          );

          resetPasswordCommand
            .onTyped('SUCCESS', (result) => {
              this.handleSuccess(
                response,
                {
                  message: result.message
                },
                status.OK
              );
            })
            .onTyped('TOKEN_NOT_FOUND', (error) => {
              this.handleNotFound(response, String(error));
            })
            .onTyped('TOKEN_EXPIRED', (error) => {
              this.handleValidationError(response, String(error));
            })
            .onTyped('INVALID_TOKEN', (error) => {
              this.handleValidationError(response, String(error));
            })
            .onTyped('ERROR', (error) => {
              this.logger.error('Error in reset password process', { error });
              this.handleError(response);
            });

          await resetPasswordCommand.execute(resetPasswordData);
        } catch (error) {
          this.logger.error('Unexpected error in reset password', error);
          this.handleError(response)(error);
        }
      }
    };
  }

  /**
   * Sends a verification email when a new user is created.
   * This method orchestrates the execution of the `SendEmailOnUserCreation` use case.
   * Handles various scenarios such as missing user ID, user not found, and internal errors.
   *
   * @return {Object} An object containing the `_sendEmailOnUserCreation` method handler.
   */
  public sendEmailOnUserCreation(): { _sendEmailOnUserCreation: ControllerMethod } {
    return {
      _sendEmailOnUserCreation: async (
        request: HttpRequest,
        response: HttpResponse,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        next: HttpNext
      ): Promise<void> => {
        try {
          const body = request.body as { email: string; };
          const { email } = body;

          const emailUserDTO = await EmailUserDTO.validate({ email });

          // Create an instance of SendEmailOnUserCreation use case
          const sendEmailOnUserCreation = new SendEmailOnUserCreation(
            this.tokenRepository,
            this.userRepository,
            this.emailService,
            this.config,
            this.logger
          );

          sendEmailOnUserCreation
            .onTyped('EMAIL_SENT', (result) => {
              this.handleSuccess(
                response,
                {
                  message: 'Verification email sent successfully',
                  email: result.email
                },
                status.OK
              );
            })
            .onTyped('USER_ALREADY_VERIFIED', (data) => {
              this.handleSuccess(
                response,
                {
                  message: 'User is already verified',
                  email: data.email
                },
                status.OK
              );
            })
            .onTyped('NOTFOUND_ERROR', (error) => {
              this.handleNotFound(response, String(error));
            })
            .onTyped('AVAILABILITY_ERROR', (error) => {
              this.handleError(response)(error);
            })
            .onTyped('ERROR', (error) => {
              this.logger.error('Error in reset password process', { error });
              this.handleError(response);
            });

          await sendEmailOnUserCreation.execute(emailUserDTO);
        } catch (error) {
          this.logger.error('Unexpected error in send validation email', error);
          this.handleError(response)(error);
        }
      }
    };
  }
}
