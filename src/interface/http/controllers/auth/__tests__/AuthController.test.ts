import { status } from 'http-status';
import { AuthController } from '../AuthController';
import { VerifyEmail, LoginUser, LogoutUser, ForgotPassword, ResetPassword } from '@application/use_cases/auth';
import { SendEmailOnUserCreation } from '@application/use_cases/notification';
import { HttpRequest, HttpResponse } from '@interface/http/types/Http';
import { faker } from '@faker-js/faker';
import { UserRole } from '@enterprise/enum';
import { IEmailService } from '@application/contracts/communication/email';
import { IConfig, ILogger } from '@application/contracts/infrastructure';
import { ITokenRepository, IUserRepository } from '@application/contracts/domain/repositories';

jest.mock('@application/use_cases/auth/VerifyEmail');
jest.mock('@application/use_cases/auth/LoginUser');
jest.mock('@application/use_cases/auth/LogoutUser');
jest.mock('@application/use_cases/auth/ForgotPassword');
jest.mock('@application/use_cases/auth/ResetPassword');
jest.mock('@application/use_cases/notification/SendEmailOnUserCreation');

describe('AuthController', () => {
  let authController: AuthController;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockTokenRepository: jest.Mocked<ITokenRepository>;
  let mockEmailService: jest.Mocked<IEmailService>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockConfig: jest.Mocked<IConfig>;
  let mockRequest: Partial<HttpRequest>;
  let mockResponse: Partial<HttpResponse>;
  let mockNext: jest.Mock;
  let mockJsonFn: jest.Mock;
  let mockStatusFn: jest.Mock;
  let mockVerifyEmailInstance: jest.Mocked<VerifyEmail>;
  let mockLoginUserInstance: jest.Mocked<LoginUser>;
  let mockLogoutUserInstance: jest.Mocked<LogoutUser>;
  let mockForgotPasswordInstance: jest.Mocked<ForgotPassword>;
  let mockResetPasswordInstance: jest.Mocked<ResetPassword>;
  let mockSendEmailOnUserCreationInstance: jest.Mocked<SendEmailOnUserCreation>;

  const userId = faker.string.uuid();
  const mockToken = faker.string.alphanumeric(32);

  const mockAccessToken = faker.string.alphanumeric(32);
  const mockRefreshToken = faker.string.alphanumeric(32);
  const mockAccessExpires = new Date(Date.now() + 3600000); // 1 hour from now
  const mockRefreshExpires = new Date(Date.now() + 2592000000);

  beforeEach(() => {
    jest.clearAllMocks();

    mockUserRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };

    mockTokenRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findByToken: jest.fn(),
      update: jest.fn(),
      revoke: jest.fn(),
      delete: jest.fn(),
      removeExpired: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockEmailService = {
      sendEmail: jest.fn(),
      verify: jest.fn()
    };

    mockJsonFn = jest.fn();
    mockStatusFn = jest.fn().mockReturnValue({ json: mockJsonFn });
    mockResponse = { status: mockStatusFn };
    mockNext = jest.fn();

    // Setup Verify Email Instance
    mockVerifyEmailInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockReturnThis(),
      outputs: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
        USER_NOT_FOUND: 'USER_NOT_FOUND',
        TOKEN_EXPIRED: 'TOKEN_EXPIRED',
        ALREADY_VERIFIED: 'ALREADY_VERIFIED'
      }
    } as unknown as jest.Mocked<VerifyEmail>;

    (VerifyEmail as jest.MockedClass<typeof VerifyEmail>).mockImplementation(
      () => mockVerifyEmailInstance
    );

    // Setup Login User Instance
    mockLoginUserInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockImplementation((event, handler) => {
        if (event === 'SUCCESS') {
          handler({
            userId: "68545171-f15c-4be7-bc86-2d0cd6b3114b",
            accessToken: mockAccessToken,
            accessTokenExpires: mockAccessExpires,
            refreshToken: mockRefreshToken,
            refreshTokenExpires: mockRefreshExpires
          });
        }
        return mockLoginUserInstance;
      }),
      outputs: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
        USER_NOT_FOUND: 'USER_NOT_FOUND',
        ACCOUNT_NOT_VERIFIED: 'ACCOUNT_NOT_VERIFIED'
      }
    } as unknown as jest.Mocked<LoginUser>;

    // Update the LoginUser mock constructor
    (LoginUser as jest.MockedClass<typeof LoginUser>).mockImplementation(
      () => mockLoginUserInstance
    );

    mockConfig = {
      env: 'test',
      MONGOOSE_DEBUG: false,
      jwt: {
        secret: 'test-secret',
        accessExpirationMinutes: 60, // 1 hour
        refreshExpirationDays: 30,
        resetPasswordExpirationMinutes: 10,
        verifyEmailExpirationMinutes: 10
      },
      db: 'mongodb://localhost:27017/test',
      db_config: {
        useNewUrlParser: true,
        useUnifiedTopology: true
      },
      storage: {
        type: 'local',
        aws: {
          bucketName: undefined,
          accessKeyId: undefined,
          secretAccessKey: undefined,
          region: undefined
        }
      },
      server: {
        protocol: 'http',
        host: 'localhost',
        port: 3000,
        version: '1.0.0'
      },
      smtp: {
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        debug: false,
        username: 'test',
        password: 'test',
        from: 'test@example.com'
      },
      redis: {
        host: 'localhost',
        port: 3011
      }
    };

    const mockGenerateToken = {
      generateJWTToken: jest.fn().mockReturnValue('mock-token'),
      validateJWTToken: jest.fn().mockReturnValue({ userId: 'mock-user-id' })
    };

    const mockGenerateVerificationToken = {
      generateToken: jest.fn().mockReturnValue('mock-token'),
      validateToken: jest.fn().mockReturnValue({ userId: 'mock-user-id' })
    };

    const mockTokenBlackList = {
      addToBlackList: jest.fn(),
      isBlackListed: jest.fn()
    };

    const mockPasswordHasher = {
      hashPassword: jest.fn(),
      comparePasswords: jest.fn()
    };

    mockLogoutUserInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockReturnThis(),
      outputs: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        INVALID_TOKEN: 'INVALID_TOKEN'
      }
    } as unknown as jest.Mocked<LogoutUser>;

    (LogoutUser as jest.MockedClass<typeof LogoutUser>).mockImplementation(
      () => mockLogoutUserInstance
    );

    mockForgotPasswordInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockReturnThis(),
      outputs: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        USER_NOT_FOUND: 'USER_NOT_FOUND',
        ACCOUNT_NOT_VERIFIED: 'ACCOUNT_NOT_VERIFIED'
      }
    } as unknown as jest.Mocked<ForgotPassword>;

    (ForgotPassword as jest.MockedClass<typeof ForgotPassword>).mockImplementation(
      () => mockForgotPasswordInstance
    );

    mockResetPasswordInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockReturnThis(),
      emitOutput: jest.fn(),
      outputs: {
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
        TOKEN_EXPIRED: 'TOKEN_EXPIRED',
        INVALID_TOKEN: 'INVALID_TOKEN'
      }
    } as unknown as jest.Mocked<ResetPassword>;

    (ResetPassword as jest.MockedClass<typeof ResetPassword>).mockImplementation(
      () => mockResetPasswordInstance
    );

    mockSendEmailOnUserCreationInstance = {
      execute: jest.fn(),
      onTyped: jest.fn().mockReturnThis(),
      outputs: {
        EMAIL_SENT: 'EMAIL_SENT',
        ERROR: 'ERROR',
        NOTFOUND_ERROR: 'NOTFOUND_ERROR',
        AVAILABILITY_ERROR: 'AVAILABILITY_ERROR'
      }
    } as unknown as jest.Mocked<SendEmailOnUserCreation>;

    (SendEmailOnUserCreation as jest.MockedClass<typeof SendEmailOnUserCreation>).mockImplementation(
      () => mockSendEmailOnUserCreationInstance
    );

    authController = new AuthController(
      mockUserRepository,
      mockTokenRepository,
      mockGenerateToken,
      mockGenerateVerificationToken,
      mockPasswordHasher,
      mockLogger,
      mockConfig,
      mockTokenBlackList,
      mockEmailService
    );
  });

  describe('verifyEmail', () => {
    beforeEach(() => {
      mockRequest = {
        query: { token: mockToken }
      };
    });

    it('should return 400 if token is missing', async () => {
      // Arrange
      mockRequest = { params: {} };
      const { _verifyEmail } = authController.verifyEmail();

      // Act
      await _verifyEmail(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'Verification token is required',
        message: 'Validation failed',
        type: 'ValidationError'
      });
      expect(mockVerifyEmailInstance.execute).not.toHaveBeenCalled();
    });

    it('should handle successful email verification', async () => {
      // Arrange
      const { _verifyEmail } = authController.verifyEmail();

      // Mock the success case
      mockVerifyEmailInstance.execute.mockImplementation(() => {
        const successHandler = mockVerifyEmailInstance.onTyped.mock.calls.find(
          call => call[0] === 'SUCCESS'
        )?.[1];

        if (successHandler) {
          successHandler({ userId });
        }
        return Promise.resolve();
      });

      // Act
      await _verifyEmail(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockVerifyEmailInstance.execute).toHaveBeenCalledWith(mockToken);
      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: {
          message: 'Email verified successfully',
          userId: userId
        }
      });
    });

    it('should handle token not found error', async () => {
      // Arrange
      const { _verifyEmail } = authController.verifyEmail();
      const errorMessage = 'Verification token not found';

      // Mock the token not found case
      mockVerifyEmailInstance.execute.mockImplementation(() => {
        const errorHandler = mockVerifyEmailInstance.onTyped.mock.calls.find(
          call => call[0] === 'TOKEN_NOT_FOUND'
        )?.[1];

        if (errorHandler) {
          errorHandler(errorMessage);
        }
        return Promise.resolve();
      });

      // Act
      await _verifyEmail(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: 'Verification token not found',
        type: 'NotFoundError'
      });
    });

    it('should handle user not found error', async () => {
      // Arrange
      const { _verifyEmail } = authController.verifyEmail();
      const errorMessage = 'User not found for this verification token';

      // Mock the user not found case
      mockVerifyEmailInstance.execute.mockImplementation(() => {
        const errorHandler = mockVerifyEmailInstance.onTyped.mock.calls.find(
          call => call[0] === 'USER_NOT_FOUND'
        )?.[1];

        if (errorHandler) {
          errorHandler(errorMessage);
        }
        return Promise.resolve();
      });

      // Act
      await _verifyEmail(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: 'User not found for this verification token',
        type: 'NotFoundError'
      });
    });

    it('should handle token expired error', async () => {
      // Arrange
      const { _verifyEmail } = authController.verifyEmail();
      const errorMessage = 'Verification token has expired';

      // Mock the token expired case
      mockVerifyEmailInstance.execute.mockImplementation(() => {
        const errorHandler = mockVerifyEmailInstance.onTyped.mock.calls.find(
          call => call[0] === 'TOKEN_EXPIRED'
        )?.[1];

        if (errorHandler) {
          errorHandler(errorMessage);
        }
        return Promise.resolve();
      });

      // Act
      await _verifyEmail(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'Verification token has expired',
        message: 'Validation failed',
        type: 'ValidationError'
      });
    });

    it('should handle already verified email', async () => {
      // Arrange
      const { _verifyEmail } = authController.verifyEmail();

      // Mock the already verified case
      mockVerifyEmailInstance.execute.mockImplementation(() => {
        const handler = mockVerifyEmailInstance.onTyped.mock.calls.find(
          call => call[0] === 'ALREADY_VERIFIED'
        )?.[1];

        if (handler) {
          handler({ userId });
        }
        return Promise.resolve();
      });

      // Act
      await _verifyEmail(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: {
          message: 'Email already verified',
          userId: userId
        }
      });
    });

    it('should handle general errors', async () => {
      // Arrange
      const { _verifyEmail } = authController.verifyEmail();
      const error = new Error('General error occurred');

      // Mock the general error case
      mockVerifyEmailInstance.execute.mockImplementation(() => {
        const errorHandler = mockVerifyEmailInstance.onTyped.mock.calls.find(
          call => call[0] === 'ERROR'
        )?.[1];

        if (errorHandler) {
          errorHandler(error);
        }
        return Promise.resolve();
      });

      // Act
      await _verifyEmail(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: error,
        message: 'General error occurred',
        type: 'InternalServerError'
      });
    });

    it('should handle exceptions during execution', async () => {
      // Arrange
      const { _verifyEmail } = authController.verifyEmail();
      const error = new Error('Unexpected error');

      // Mock an exception being thrown
      mockVerifyEmailInstance.execute.mockRejectedValue(error);

      // Act
      await _verifyEmail(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: error,
        message: 'Unexpected error',
        type: 'InternalServerError'
      });
    });

    it('should handle validation errors with status code', async () => {
      // Arrange
      const { _verifyEmail } = authController.verifyEmail();
      const validationError = new Error('Validation failed') as Error & { statusCode: number };
      validationError.statusCode = status.BAD_REQUEST;

      // Mock an exception being thrown with status code
      mockVerifyEmailInstance.execute.mockRejectedValue(validationError);

      // Act
      await _verifyEmail(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'Validation failed',
        message: 'Validation failed',
        type: 'ValidationError'
      });
    });
  });

  describe('login', () => {
    beforeEach(() => {
      mockRequest = {
        body: {
          email: 'test@example.com',
          password: 'Password123!'
        }
      };
    });

    it('should return 200 with token when login is successful', async () => {
      // Define mock token data
      const mockTokenData = {
        access: {
          token: mockAccessToken,
          expires: mockAccessExpires,
        },
        refresh: {
          token: mockRefreshToken,
          expires: mockRefreshExpires,
        }
      };

      mockLoginUserInstance.execute.mockImplementation(async () => {
        mockLoginUserInstance.onTyped.mock.calls
          .find(call => call[0] === 'SUCCESS')?.[1]({
          userId: "68545171-f15c-4be7-bc86-2d0cd6b3114b",
          tokens: mockTokenData
        });
      });

      const { _login } = authController.login();
      await _login(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);

      // Use a more flexible approach for dynamic values
      expect(mockJsonFn).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          tokens: expect.objectContaining({
            access: expect.objectContaining({
              expires: expect.any(Date),
              token: expect.any(String),
            }),
            refresh: expect.objectContaining({
              expires: expect.any(Date),
              token: expect.any(String),
            }),
          }),
          userId: "68545171-f15c-4be7-bc86-2d0cd6b3114b",
        }),
      }));
    });

    it('should return 404 when user is not found', async () => {
      // Set up mock to emit USER_NOT_FOUND event when execute is called
      mockLoginUserInstance.execute.mockImplementation(async () => {
        mockLoginUserInstance.onTyped.mock.calls
          .find(call => call[0] === 'USER_NOT_FOUND')?.[1](
          'No user found with email test@example.com'
        );
      });

      const { _login } = authController.login();
      await _login(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: "No user found with email test@example.com",
        type: "NotFoundError"
      });
    });

    it('should return 401 when credentials are invalid', async () => {
      // Set up mock to emit INVALID_CREDENTIALS event when execute is called
      mockLoginUserInstance.execute.mockImplementation(async () => {
        mockLoginUserInstance.onTyped.mock.calls
          .find(call => call[0] === 'INVALID_CREDENTIALS')?.[1](
          'Invalid email or password'
        );
      });

      const { _login } = authController.login();
      await _login(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockStatusFn).toHaveBeenCalledWith(status.UNAUTHORIZED);
      expect(mockJsonFn).toHaveBeenCalledWith({
        message: "Invalid email or password",
        type: "UnauthorizedError"
      });
    });

    it('should return 403 when account is not verified', async () => {
      // Set up mock to emit ACCOUNT_NOT_VERIFIED event when execute is called
      mockLoginUserInstance.execute.mockImplementation(async () => {
        mockLoginUserInstance.onTyped.mock.calls
          .find(call => call[0] === 'ACCOUNT_NOT_VERIFIED')?.[1](
          'Please verify your email before logging in'
        );
      });

      const { _login } = authController.login();
      await _login(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockStatusFn).toHaveBeenCalledWith(status.FORBIDDEN);
      expect(mockJsonFn).toHaveBeenCalledWith({
        message: "Please verify your email before logging in",
        type: "ForbiddenError"
      });
    });

    it('should return 500 when an unexpected error occurs', async () => {
      const error = new Error('Unexpected error');

      // Set up mock to emit ERROR event when execute is called
      mockLoginUserInstance.execute.mockImplementation(async () => {
        mockLoginUserInstance.onTyped.mock.calls
          .find(call => call[0] === 'ERROR')?.[1](error);
      });

      const { _login } = authController.login();
      await _login(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: error,
        message: "Unexpected error",
        type: "InternalServerError"
      });
    });
  });
  describe('logout', () => {
    it('should successfully logout a user', async () => {
      // Arrange
      const accessToken = faker.string.alphanumeric(32);
      const refreshToken = faker.string.alphanumeric(32);

      mockRequest = {
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: {
          refreshToken
        }
      };

      mockLogoutUserInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'SUCCESS') {
          handler({ message: 'Successfully logged out' });
        }
        return mockLogoutUserInstance;
      });

      // Act
      await authController.logout()._logout(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockLogoutUserInstance.execute).toHaveBeenCalledWith({
        accessToken,
        refreshToken
      });
      expect(mockStatusFn).toHaveBeenCalledWith(status.NO_CONTENT);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: { message: 'Successfully logged out' }
      });
    });

    it('should handle missing authorization header', async () => {
      // Arrange
      mockRequest = {
        headers: {},
        body: {
          refreshToken: faker.string.alphanumeric(32)
        }
      };

      // Act
      await authController.logout()._logout(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockLogoutUserInstance.execute).not.toHaveBeenCalled();
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        type: 'ValidationError',
        details: 'Access token and refresh token are required',
        message: 'Validation failed'
      });
    });

    it('should handle missing refresh token', async () => {
      // Arrange
      mockRequest = {
        headers: {
          authorization: `Bearer ${faker.string.alphanumeric(32)}`
        },
        body: {}
      };

      // Act
      await authController.logout()._logout(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockLogoutUserInstance.execute).not.toHaveBeenCalled();
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'Access token and refresh token are required',
        type: 'ValidationError',
        message: 'Validation failed'
      });
    });

    it('should handle invalid token error', async () => {
      // Arrange
      const accessToken = faker.string.alphanumeric(32);
      const refreshToken = faker.string.alphanumeric(32);

      mockRequest = {
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: {
          refreshToken
        }
      };

      mockLogoutUserInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'INVALID_TOKEN') {
          handler('Invalid or expired tokens');
        }
        return mockLogoutUserInstance;
      });

      // Act
      await authController.logout()._logout(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        type: 'ValidationError',
        message: 'Validation failed',
        details: 'Invalid or expired tokens'
      });
    });

    it('should handle unexpected errors', async () => {
      // Arrange
      const accessToken = faker.string.alphanumeric(32);
      const refreshToken = faker.string.alphanumeric(32);

      mockRequest = {
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        body: {
          refreshToken
        }
      };

      mockLogoutUserInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'ERROR') {
          handler(new Error('Unexpected error'));
        }
        return mockLogoutUserInstance;
      });

      // Act
      await authController.logout()._logout(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: new Error('Unexpected error'),
        type: 'InternalServerError',
        message: 'Unexpected error'
      });
    });
  });
  describe('forgotPassword', () => {
    const validEmail = 'test@example.com';

    beforeEach(() => {
      mockRequest = {
        body: { email: validEmail }
      };
    });

    it('should return 400 if email is not provided', async () => {
      // Arrange
      mockRequest.body = {};
      const { _forgotPassword } = authController.forgotPassword();

      // Act
      await _forgotPassword(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockStatusFn).toHaveBeenCalledWith(400);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'Email is required',
        message: 'Validation failed',
        type: 'ValidationError'
      });
      expect(mockForgotPasswordInstance.execute).not.toHaveBeenCalled();
    });

    it('should handle successful forgot password request', async () => {
      // Arrange
      const successMessage = 'Password reset instructions sent to your email';
      mockForgotPasswordInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'SUCCESS') {
          handler({ message: successMessage });
        }
        return mockForgotPasswordInstance;
      });

      const { _forgotPassword } = authController.forgotPassword();

      // Act
      await _forgotPassword(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockForgotPasswordInstance.execute).toHaveBeenCalledWith({ email: validEmail });
      expect(mockForgotPasswordInstance.onTyped).toHaveBeenCalledWith('SUCCESS', expect.any(Function));
      expect(mockStatusFn).toHaveBeenCalledWith(200);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: {
          message: successMessage
        }
      });
    });

    it('should handle user not found', async () => {
      // Arrange
      const errorMessage = 'User with this email does not exist';
      mockForgotPasswordInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'USER_NOT_FOUND') {
          handler(errorMessage);
        }
        return mockForgotPasswordInstance;
      });

      const { _forgotPassword } = authController.forgotPassword();

      // Act
      await _forgotPassword(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockForgotPasswordInstance.execute).toHaveBeenCalledWith({ email: validEmail });
      expect(mockForgotPasswordInstance.onTyped).toHaveBeenCalledWith('USER_NOT_FOUND', expect.any(Function));
      expect(mockStatusFn).toHaveBeenCalledWith(404);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: errorMessage,
        type: 'NotFoundError'
      });
    });

    it('should handle account not verified', async () => {
      // Arrange
      const errorMessage = 'Account not verified. Please verify your email first';
      mockForgotPasswordInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'ACCOUNT_NOT_VERIFIED') {
          handler(errorMessage);
        }
        return mockForgotPasswordInstance;
      });

      const { _forgotPassword } = authController.forgotPassword();

      // Act
      await _forgotPassword(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockForgotPasswordInstance.execute).toHaveBeenCalledWith({ email: validEmail });
      expect(mockForgotPasswordInstance.onTyped).toHaveBeenCalledWith('ACCOUNT_NOT_VERIFIED', expect.any(Function));
      expect(mockStatusFn).toHaveBeenCalledWith(403);
      expect(mockJsonFn).toHaveBeenCalledWith({
        message: errorMessage,
        type: 'ForbiddenError'
      });
    });

    it('should handle unexpected errors', async () => {
      // Arrange
      const error = new Error('Unexpected error');
      mockForgotPasswordInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'ERROR') {
          handler(error);
        }
        return mockForgotPasswordInstance;
      });

      const { _forgotPassword } = authController.forgotPassword();

      // Act
      await _forgotPassword(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockForgotPasswordInstance.execute).toHaveBeenCalledWith({ email: validEmail });
      expect(mockForgotPasswordInstance.onTyped).toHaveBeenCalledWith('ERROR', expect.any(Function));
      expect(mockStatusFn).toHaveBeenCalledWith(500);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: error,
        message: error.message,
        type: 'InternalServerError'
      });
    });

    it('should catch and handle errors thrown during execution', async () => {
      // Arrange
      const unexpectedError = new Error('Unexpected runtime error');
      mockForgotPasswordInstance.execute.mockRejectedValue(unexpectedError);

      const { _forgotPassword } = authController.forgotPassword();

      // Act
      await _forgotPassword(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Assert
      expect(mockForgotPasswordInstance.execute).toHaveBeenCalledWith({ email: validEmail });
      expect(mockStatusFn).toHaveBeenCalledWith(500);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: unexpectedError,
        message: unexpectedError.message,
        type: 'InternalServerError'
      });
    });
  });

  describe('resetPassword', () => {
    it('should return 400 if token is missing', async () => {
      mockRequest = {
        body: {
          password: 'newPassword123!'
        }
      };

      const { _resetPassword } = authController.resetPassword();

      await _resetPassword(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockStatusFn).toHaveBeenCalledWith(400);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'Reset token is required',
        message: 'Validation failed',
        type: 'ValidationError'
      });
      expect(mockResetPasswordInstance.execute).not.toHaveBeenCalled();
    });

    it('should return 400 if password is missing', async () => {
      mockRequest = {
        body: {
          token: 'valid-token'
        }
      };

      const { _resetPassword } = authController.resetPassword();

      await _resetPassword(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockStatusFn).toHaveBeenCalledWith(400);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'New password is required',
        message: 'Validation failed',
        type: 'ValidationError'
      });
      expect(mockResetPasswordInstance.execute).not.toHaveBeenCalled();
    });

    it('should handle successful password reset', async () => {
      mockRequest = {
        body: {
          token: 'valid-token',
          password: 'newPassword123!'
        }
      };

      mockResetPasswordInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'SUCCESS') {
          handler({ message: 'Password has been reset successfully' });
        }
        return mockResetPasswordInstance;
      });

      const { _resetPassword } = authController.resetPassword();

      await _resetPassword(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockResetPasswordInstance.execute).toHaveBeenCalledWith({
        token: 'valid-token',
        newPassword: 'newPassword123!'
      });
      expect(mockStatusFn).toHaveBeenCalledWith(200);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: {
          message: 'Password has been reset successfully'
        }
      });
    });

    it('should return 404 for token not found', async () => {
      mockRequest = {
        body: {
          token: 'invalid-token',
          password: 'newPassword123!'
        }
      };

      mockResetPasswordInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'TOKEN_NOT_FOUND') {
          handler('Invalid or expired reset token');
        }
        return mockResetPasswordInstance;
      });

      const { _resetPassword } = authController.resetPassword();

      await _resetPassword(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockResetPasswordInstance.execute).toHaveBeenCalledWith({
        token: 'invalid-token',
        newPassword: 'newPassword123!'
      });
      expect(mockStatusFn).toHaveBeenCalledWith(404);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: 'Invalid or expired reset token',
        type: 'NotFoundError'
      });
    });

    it('should return 400 for expired token', async () => {
      mockRequest = {
        body: {
          token: 'expired-token',
          password: 'newPassword123!'
        }
      };

      mockResetPasswordInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'TOKEN_EXPIRED') {
          handler('Reset token has expired');
        }
        return mockResetPasswordInstance;
      });

      const { _resetPassword } = authController.resetPassword();

      await _resetPassword(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockResetPasswordInstance.execute).toHaveBeenCalledWith({
        token: 'expired-token',
        newPassword: 'newPassword123!'
      });
      expect(mockStatusFn).toHaveBeenCalledWith(400);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'Reset token has expired',
        message: 'Validation failed',
        type: 'ValidationError'
      });
    });

    it('should return 400 for invalid token type', async () => {
      mockRequest = {
        body: {
          token: 'wrong-type-token',
          password: 'newPassword123!'
        }
      };

      mockResetPasswordInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'INVALID_TOKEN') {
          handler('Invalid reset token');
        }
        return mockResetPasswordInstance;
      });

      const { _resetPassword } = authController.resetPassword();

      await _resetPassword(mockRequest as HttpRequest, mockResponse as HttpResponse, mockNext);

      expect(mockResetPasswordInstance.execute).toHaveBeenCalledWith({
        token: 'wrong-type-token',
        newPassword: 'newPassword123!'
      });
      expect(mockStatusFn).toHaveBeenCalledWith(400);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'Invalid reset token',
        message: 'Validation failed',
        type: 'ValidationError'
      });
    });

    it('should handle unexpected exceptions', async () => {
      mockRequest = {
        body: {
          token: 'valid-token',
          password: 'newPassword123'
        }
      };

      mockResetPasswordInstance.execute.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      (ResetPassword as jest.MockedClass<typeof ResetPassword>).mockImplementation(
        () => mockResetPasswordInstance
      );

      const { _resetPassword } = authController.resetPassword();

      await _resetPassword(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // 6. Verify the error was handled properly
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockStatusFn).toHaveBeenCalledWith(500);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: new Error('Unexpected error'),
        message: 'Unexpected error',
        type: 'InternalServerError'
      });
    });
  });

  describe('sendEmailOnUserCreation', () => {
    it('should handle USER_ALREADY_VERIFIED event', async () => {
      const testUser = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        role: UserRole.USER,
        isVerified: true
      };

      mockRequest = {
        body: { email: testUser.email }
      };

      mockUserRepository.findByEmail.mockResolvedValue(testUser);

      // Mock event handlers
      mockSendEmailOnUserCreationInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'USER_ALREADY_VERIFIED') {
          handler({
            userId: testUser.id,
            email: testUser.email
          });
        }
        return mockSendEmailOnUserCreationInstance;
      });

      // Execute
      const { _sendEmailOnUserCreation } = authController.sendEmailOnUserCreation();
      await _sendEmailOnUserCreation(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Verify
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(testUser.email);
      expect(SendEmailOnUserCreation).toHaveBeenCalledWith(
        mockTokenRepository,
        mockEmailService,
        mockConfig,
        mockLogger
      );
      expect(mockSendEmailOnUserCreationInstance.execute).toHaveBeenCalledWith(testUser);
      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: {
          message: 'User is already verified',
          email: testUser.email
        },
      });
    });

    it('should return 400 if userId is not provided', async () => {
      // Setup
      mockRequest = {
        body: {}
      };

      // Execute
      const { _sendEmailOnUserCreation } = authController.sendEmailOnUserCreation();
      await _sendEmailOnUserCreation(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Verify
      expect(mockStatusFn).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: 'User email is required',
        message: 'Validation failed',
        type: 'ValidationError'
      });
    });

    it('should return 404 if user with provided email is not found', async () => {
      // Use email instead of userId
      const nonExistentEmail = 'nonexistent@example.com';
      mockRequest = {
        body: { email: nonExistentEmail }
      };

      // Mock findByEmail to return null (user not found)
      mockUserRepository.findByEmail.mockResolvedValue(undefined);

      // Execute
      const { _sendEmailOnUserCreation } = authController.sendEmailOnUserCreation();
      await _sendEmailOnUserCreation(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Verify
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(nonExistentEmail);
      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: `User with email ${nonExistentEmail} not found`,
        type: 'NotFoundError'
      });
    });

    it('should call SendEmailOnUserCreation and handle success', async () => {
      // Setup
      const testUser = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        role: UserRole.USER,
        isVerified: false
      };

      mockRequest = {
        body: { email: testUser.email }
      };

      mockUserRepository.findByEmail.mockResolvedValue(testUser);

      // Mock event handlers
      mockSendEmailOnUserCreationInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'EMAIL_SENT') {
          handler({
            userId: testUser.id,
            email: testUser.email
          });
        }
        return mockSendEmailOnUserCreationInstance;
      });

      // Execute
      const { _sendEmailOnUserCreation } = authController.sendEmailOnUserCreation();
      await _sendEmailOnUserCreation(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Verify
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(testUser.email);
      expect(SendEmailOnUserCreation).toHaveBeenCalledWith(
        mockTokenRepository,
        mockEmailService,
        mockConfig,
        mockLogger
      );
      expect(mockSendEmailOnUserCreationInstance.execute).toHaveBeenCalledWith(testUser);
      expect(mockStatusFn).toHaveBeenCalledWith(status.OK);
      expect(mockJsonFn).toHaveBeenCalledWith({
        data: {
          message: 'Verification email sent successfully',
          email: testUser.email
        },
      });
    });

    it('should handle NOTFOUND_ERROR from SendEmailOnUserCreation', async () => {
      // Setup
      const testUser = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        role: UserRole.USER,
        isVerified: false
      };

      mockRequest = {
        body: { email: testUser.email }
      };

      mockUserRepository.findByEmail.mockResolvedValue(testUser);

      // Mock event handlers
      mockSendEmailOnUserCreationInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'NOTFOUND_ERROR') {
          handler(`No verification token found for user: ${userId}`);
        }
        return mockSendEmailOnUserCreationInstance;
      });

      // Execute
      const { _sendEmailOnUserCreation } = authController.sendEmailOnUserCreation();
      await _sendEmailOnUserCreation(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Verify
      expect(mockStatusFn).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: null,
        message: `No verification token found for user: ${userId}`,
        type: 'NotFoundError'
      });
    });

    it('should handle AVAILABILITY_ERROR from SendEmailOnUserCreation', async () => {
      // Setup
      const testUser = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        role: UserRole.USER,
        isVerified: false
      };

      mockRequest = {
        body: { email: testUser.email }
      };

      mockUserRepository.findByEmail.mockResolvedValue(testUser);

      const errorMessage = 'There was an error with the availability of the SMTP server';

      // Mock event handlers
      mockSendEmailOnUserCreationInstance.onTyped.mockImplementation((event, handler) => {
        if (event === 'AVAILABILITY_ERROR') {
          handler(errorMessage);
        }
        return mockSendEmailOnUserCreationInstance;
      });

      // Execute
      const { _sendEmailOnUserCreation } = authController.sendEmailOnUserCreation();
      await _sendEmailOnUserCreation(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Verify
      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: errorMessage,
        message: 'An unexpected error occurred',
        type: 'InternalServerError'
      });
    });

    it('should handle unexpected errors', async () => {
      // Setup
      const email = 'test@example.com';
      mockRequest = {
        body: { email }
      };

      // Mock user to be found
      const mockUser = {
        id: userId,
        email,
        name: 'Test User',
        username: 'testuser',
        role: UserRole.USER,
        isVerified: false
      };
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      // Mock SendEmailOnUserCreation instance to throw an error
      mockSendEmailOnUserCreationInstance.execute.mockRejectedValue(new Error('Unexpected error'));
      (SendEmailOnUserCreation as jest.MockedClass<typeof SendEmailOnUserCreation>).mockImplementation(
        () => mockSendEmailOnUserCreationInstance
      );

      // Execute
      const { _sendEmailOnUserCreation } = authController.sendEmailOnUserCreation();
      await _sendEmailOnUserCreation(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Verify
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR); // Use http-status constant
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: new Error('Unexpected error'),
        message: 'Unexpected error',
        type: 'InternalServerError'
      });
    });

    it('should handle unexpected errors during execution', async () => {
      // Setup
      const testUser = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        role: UserRole.USER,
        isVerified: false
      };

      mockRequest = {
        body: { email: testUser.email }
      };

      mockUserRepository.findByEmail.mockResolvedValue(testUser);

      const unexpectedError = new Error('Unexpected error');
      mockSendEmailOnUserCreationInstance.execute.mockRejectedValue(unexpectedError);

      // Execute
      const { _sendEmailOnUserCreation } = authController.sendEmailOnUserCreation();
      await _sendEmailOnUserCreation(
        mockRequest as HttpRequest,
        mockResponse as HttpResponse,
        mockNext
      );

      // Verify
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unexpected error in send validation email',
        unexpectedError
      );
      expect(mockStatusFn).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJsonFn).toHaveBeenCalledWith({
        details: new Error('Unexpected error'),
        message: 'Unexpected error',
        type: 'InternalServerError'
      });
    });
  });
});
