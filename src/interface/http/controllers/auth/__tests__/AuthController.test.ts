import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { faker } from '@faker-js/faker';
import status from 'http-status';

// --- Application Layer Mocks ---
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

// --- Enterprise Layer Mocks ---
import {
  AuthenticateUserDTO,
  EmailUserDTO,
  LogoutRequestDTO,
  ResetPasswordDTO
} from '@enterprise/dto/input/auth';
import { TokenInputDTO } from '@enterprise/dto/input/token';

// --- Interface Layer ---
import {
  HttpRequest,
  HttpResponse,
  HttpNext,
  ResponseObject,
  ControllerMethod
} from '@interface/http/adapters/Http';
import { AuthController } from '@interface/http/controllers/auth/AuthController';
import { ValidationError } from 'class-validator';
import { DTOValidationError } from '@enterprise/dto/errors';

// --- Mock Use Cases ---
// Store listeners and allow triggering them from mock executing
type EventListener = (...args: any[]) => void;
type Listeners = { [key: string]: EventListener };

const mockUseCase = (events: string[]) => {
  const listeners: Listeners = {};
  return {
    on: jest.fn((event: string, listener: EventListener) => {
      if (events.includes(event)) {
        listeners[event] = listener;
      }
    }),
    execute: jest.fn(async (..._args: any[]) => {
      // This mock executing needs to be configured per test
      // to call the appropriate listener (e.g., listeners['SUCCESS'](mockData))
    }),
    // Helper to trigger events from tests
    __trigger: (event: string, ...args: any[]) => {
      if (listeners[event]) {
        listeners[event](...args);
      } else {
        // Optional: throw an error if trying to trigger an unlistened event
        // console.warn(`Mock UseCase: Event "${event}" has no listener.`);
      }
    }
  };
};

// Mock the actual use case classes
jest.mock('@application/use_cases/auth', () => ({
  VerifyEmail: jest.fn().mockImplementation(() =>
    mockUseCase(['SUCCESS', 'TOKEN_NOT_FOUND', 'USER_NOT_FOUND', 'TOKEN_EXPIRED', 'ALREADY_VERIFIED', 'ERROR'])),
  LoginUser: jest.fn().mockImplementation(() =>
    mockUseCase(['SUCCESS', 'USER_NOT_FOUND', 'INVALID_CREDENTIALS', 'ACCOUNT_NOT_VERIFIED', 'ERROR'])),
  LogoutUser: jest.fn().mockImplementation(() =>
    mockUseCase(['SUCCESS', 'INVALID_TOKEN', 'ERROR'])),
  ForgotPassword: jest.fn().mockImplementation(() =>
    mockUseCase(['SUCCESS', 'USER_NOT_FOUND', 'ACCOUNT_NOT_VERIFIED', 'ERROR'])),
  ResetPassword: jest.fn().mockImplementation(() =>
    mockUseCase(['SUCCESS', 'TOKEN_NOT_FOUND', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'ERROR']))
}));

jest.mock('@application/use_cases/notification', () => ({
  SendEmailOnUserCreation: jest.fn().mockImplementation(() =>
    mockUseCase(['SUCCESS', 'USER_ALREADY_VERIFIED', 'USER_NOT_FOUND', 'AVAILABILITY_ERROR', 'ERROR']))
}));

// Mock DTO static validate methods
jest.mock('@enterprise/dto/input/auth', () => ({
  AuthenticateUserDTO: {
    validate: jest.fn<(data: Record<string, unknown>) => Promise<any>>()
  },
  EmailUserDTO: {
    validate: jest.fn<(data: Record<string, unknown>) => Promise<any>>()
  },
  LogoutRequestDTO: {
    validate: jest.fn<(data: Record<string, unknown>) => Promise<any>>()
  },
  ResetPasswordDTO: {
    validate: jest.fn<(data: Record<string, unknown>) => Promise<any>>()
  }
}));

jest.mock('@enterprise/dto/input/token', () => ({
  TokenInputDTO: {
    validate: jest.fn<(data: Record<string, unknown>) => Promise<any>>()
  }
}));

// --- Mock Dependencies ---
const mockUserRepository: jest.Mocked<IUserRepository> = {
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockTokenRepository: jest.Mocked<ITokenRepository> = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findByToken: jest.fn(),
  update: jest.fn(),
  revoke: jest.fn(),
  delete: jest.fn(),
  removeExpired: jest.fn()
};

const mockJWTTokenGenerator: jest.Mocked<IJWTTokenGenerator> = {
  generateJWTToken: jest.fn(),
  validateJWTToken: jest.fn()
};

const mockTokenGenerator: jest.Mocked<ITokenGenerator> = {
  generateToken: jest.fn(),
  validateToken: jest.fn()
};

const mockPasswordHasher: jest.Mocked<IPasswordHasher> = {
  hashPassword: jest.fn(),
  comparePasswords: jest.fn(),
};

const mockLogger: jest.Mocked<ILogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockConfig: jest.Mocked<IConfig> = {
  env: 'dev',
  MONGOOSE_DEBUG: false,
  jwt: {
    secret: faker.string.alphanumeric(32),
    accessExpirationMinutes: 15,
    refreshExpirationDays: 7,
    resetPasswordExpirationMinutes: 10,
    verifyEmailExpirationMinutes: 60,
  },
  db: 'mongodb://mock-url',
  db_config: {
    useNewUrlParser: false,
    useUnifiedTopology: false
  },
  redis: {
    host: 'redis://mock-redis',
    port: 2222
  },
  storage: {
    type: 'local',
    aws: {
      bucketName: '',
      accessKeyId: '',
      secretAccessKey: '',
      region: '',
    }
  },
  server: {
    protocol: '',
    host: '',
    port: 5555,
    version: ''
  },
  smtp: {
    host: 'mock-smtp',
    port: 587,
    secure: false,
    debug: false,
    username: '',
    password: '',
    from: ''
  }
};

const mockTokenBlackList: jest.Mocked<ITokenBlackList> = {
  addToBlackList: jest.fn(),
  isBlackListed: jest.fn()
};

const mockEmailService: jest.Mocked<IEmailService> = {
  sendEmail: jest.fn(),
  verify: jest.fn()
};

// --- Mock HTTP Objects ---
const mockJson = jest.fn();
const mockResponseObject: jest.Mocked<ResponseObject> = {
  json: mockJson,
};
const mockStatus = jest.fn<(code: number) => ResponseObject>().mockReturnValue(mockResponseObject);

// Define the main mockResponse, satisfying HttpResponse
const mockResponse: jest.Mocked<HttpResponse> = {
  status: mockStatus,
};

const mockRequest: jest.Mocked<HttpRequest> = {
  body: {},
  params: {},
  query: {},
  headers: {},
};

const mockNext: jest.Mocked<HttpNext> = jest.fn();

// Helper to create DTOValidationError
const createDtoValidationError = (errors: { property: string; constraints: { [type: string]: string } }[]): DTOValidationError => {
  const validationErrors: ValidationError[] = errors.map(e => ({
    property: e.property,
    constraints: e.constraints,
    value: 'mockValue',
    target: {},
    children: [],
  }));
  return new DTOValidationError(validationErrors);
};

// --- Test Suite ---
describe('AuthController', () => {
  let authController: AuthController;
  let mockVerifyEmailUseCase: ReturnType<typeof mockUseCase>;
  let mockLoginUserUseCase: ReturnType<typeof mockUseCase>;
  let mockLogoutUserUseCase: ReturnType<typeof mockUseCase>;
  let mockForgotPasswordUseCase: ReturnType<typeof mockUseCase>;
  let mockResetPasswordUseCase: ReturnType<typeof mockUseCase>;
  let mockSendEmailOnUserCreationUseCase: ReturnType<typeof mockUseCase>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Instantiate the controller with mocks
    authController = new AuthController(
      mockUserRepository,
      mockTokenRepository,
      mockJWTTokenGenerator,
      mockTokenGenerator,
      mockPasswordHasher,
      mockLogger,
      mockConfig,
      mockTokenBlackList,
      mockEmailService
    );

    // Get mock instances of use cases
    mockVerifyEmailUseCase = new VerifyEmail(mockUserRepository, mockTokenRepository, mockLogger) as any;
    mockLoginUserUseCase = new LoginUser(mockUserRepository, mockPasswordHasher, mockJWTTokenGenerator, mockConfig, mockLogger) as any;
    mockLogoutUserUseCase = new LogoutUser(mockTokenBlackList, mockConfig, mockLogger) as any;
    mockForgotPasswordUseCase = new ForgotPassword(mockUserRepository, mockTokenRepository, mockTokenGenerator, mockConfig, mockLogger) as any;
    mockResetPasswordUseCase = new ResetPassword(mockUserRepository, mockTokenRepository, mockPasswordHasher, mockLogger) as any;
    mockSendEmailOnUserCreationUseCase = new SendEmailOnUserCreation(mockTokenRepository, mockUserRepository, mockEmailService, mockConfig, mockLogger) as any;

    (VerifyEmail as any).mockImplementation(() => mockVerifyEmailUseCase);
    (LoginUser as any).mockImplementation(() => mockLoginUserUseCase);
    (LogoutUser as any).mockImplementation(() => mockLogoutUserUseCase);
    (ForgotPassword as any).mockImplementation(() => mockForgotPasswordUseCase);
    (ResetPassword as any).mockImplementation(() => mockResetPasswordUseCase);
    (SendEmailOnUserCreation as any).mockImplementation(() => mockSendEmailOnUserCreationUseCase);

    // Reset request object parts
    mockRequest.body = {};
    mockRequest.params = {};
    mockRequest.query = {};
    mockRequest.headers = {};
  });

  // --- Test Cases for verifyEmail ---
  describe('verifyEmail', () => {
    let _verifyEmail: ControllerMethod;
    let tokenData: { token: string };

    beforeEach(() => {
      _verifyEmail = authController.verifyEmail()._verifyEmail;

      tokenData = {
        token: faker.string.alphanumeric(32)
      };

      mockRequest.query = { token: tokenData.token };

      // Mock DTO validation success by default
      (TokenInputDTO.validate as any).mockResolvedValue(tokenData);

      // Mock Use Case execution to trigger SUCCESS by default
      (mockVerifyEmailUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockVerifyEmailUseCase.__trigger('SUCCESS', { userId: faker.string.uuid() });
      });
    });

    it('should verify email successfully and return 200 status', async () => {
      const userId = faker.string.uuid();
      (mockVerifyEmailUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockVerifyEmailUseCase.__trigger('SUCCESS', { userId });
      });

      await _verifyEmail(mockRequest, mockResponse, mockNext);

      expect(TokenInputDTO.validate).toHaveBeenCalledWith({ token: tokenData.token });
      expect(VerifyEmail).toHaveBeenCalledWith(mockUserRepository, mockTokenRepository, mockLogger);
      expect(mockVerifyEmailUseCase.execute).toHaveBeenCalledWith(tokenData);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({
        data: { message: 'Email verified successfully', userId }
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle token not found error and return 404 status', async () => {
      const errorMessage = 'Verification token not found';
      (mockVerifyEmailUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockVerifyEmailUseCase.__trigger('TOKEN_NOT_FOUND', errorMessage);
      });

      await _verifyEmail(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith({
        message: errorMessage,
        details: null,
        type: 'NotFoundError'
      });
    });

    it('should handle user not found error and return 404 status', async () => {
      const errorMessage = 'User not found';
      (mockVerifyEmailUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockVerifyEmailUseCase.__trigger('USER_NOT_FOUND', errorMessage);
      });

      await _verifyEmail(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith({
        message: errorMessage,
        details: null,
        type: 'NotFoundError'
      });
    });

    it('should handle token expired error and return 400 status', async () => {
      const errorMessage = 'Verification token has expired';
      (mockVerifyEmailUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockVerifyEmailUseCase.__trigger('TOKEN_EXPIRED', errorMessage);
      });

      await _verifyEmail(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith({
        message: "Validation failed",
        details: errorMessage,
        type: 'ValidationError'
      });
    });

    it('should handle already verified email and return 200 status', async () => {
      const userId = faker.string.uuid();
      (mockVerifyEmailUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockVerifyEmailUseCase.__trigger('ALREADY_VERIFIED', { userId });
      });

      await _verifyEmail(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({
        data: { message: 'Email already verified', userId }
      });
    });

    it('should handle unexpected errors and return 500 status', async () => {
      const error = new Error('Unexpected error');

      // Set up the mock implementation
      (mockVerifyEmailUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockVerifyEmailUseCase.__trigger('ERROR', error);
      });

      await _verifyEmail(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        message: error.message,
        details: error,
        type: 'InternalServerError'
      });
    });

    it('should handle query parameter as array', async () => {
      mockRequest.query = { token: [tokenData.token] };

      await _verifyEmail(mockRequest, mockResponse, mockNext);

      expect(TokenInputDTO.validate).toHaveBeenCalledWith({ token: tokenData.token });
    });

    it('should handle missing token in query', async () => {
      mockRequest.query = {};

      const validationError = createDtoValidationError([
        { property: 'token', constraints: { isNotEmpty: 'token should not be empty' } }
      ]);

      (TokenInputDTO.validate as any).mockRejectedValue(validationError);

      await _verifyEmail(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
    });
  });

  // --- Test Cases for login ---
  describe('login', () => {
    let _login: ControllerMethod;
    let loginCredentials: {
      email: string;
      password: string;
    };
    let loginResponse: {
      userId: string;
      accessToken: string;
      refreshToken: string;
      accessTokenExpires: Date;
      refreshTokenExpires: Date;
    };

    beforeEach(() => {
      _login = authController.login()._login;

      loginCredentials = {
        email: faker.internet.email(),
        password: faker.internet.password({ length: 12 })
      };

      loginResponse = {
        userId: faker.string.uuid(),
        accessToken: faker.string.alphanumeric(40),
        refreshToken: faker.string.alphanumeric(40),
        accessTokenExpires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        refreshTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };

      mockRequest.body = loginCredentials;

      // Mock DTO validation success by default
      (AuthenticateUserDTO.validate as any).mockResolvedValue(loginCredentials);

      // Mock Use Case execution to trigger SUCCESS by default
      (mockLoginUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockLoginUserUseCase.__trigger('SUCCESS', loginResponse);
      });
    });

    it('should login user successfully and return tokens with 200 status', async () => {
      await _login(mockRequest, mockResponse, mockNext);

      expect(AuthenticateUserDTO.validate).toHaveBeenCalledWith(loginCredentials);
      expect(LoginUser).toHaveBeenCalledWith(
        mockUserRepository,
        mockPasswordHasher,
        mockJWTTokenGenerator,
        mockConfig,
        mockLogger
      );
      expect(mockLoginUserUseCase.execute).toHaveBeenCalledWith(loginCredentials);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({
        data: {
          userId: loginResponse.userId,
          tokens: {
            access: {
              token: loginResponse.accessToken,
              expires: loginResponse.accessTokenExpires
            },
            refresh: {
              token: loginResponse.refreshToken,
              expires: loginResponse.refreshTokenExpires
            }
          }
        }
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle user not found error and return 404 status', async () => {
      const errorMessage = 'User not found';
      (mockLoginUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockLoginUserUseCase.__trigger('USER_NOT_FOUND', errorMessage);
      });

      await _login(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith({
        details: null,
        message: errorMessage,
        type: 'NotFoundError'
      });
    });

    it('should handle invalid credentials and return 401 status', async () => {
      const errorMessage = 'Invalid email or password';
      (mockLoginUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockLoginUserUseCase.__trigger('INVALID_CREDENTIALS', errorMessage);
      });

      await _login(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.UNAUTHORIZED);
      expect(mockJson).toHaveBeenCalledWith({
        details: null,
        message: errorMessage,
        type: 'UnauthorizedError'
      });
    });

    it('should handle unverified account and return 403 status', async () => {
      const errorMessage = 'Account not verified. Please verify your email before logging in.';
      (mockLoginUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockLoginUserUseCase.__trigger('ACCOUNT_NOT_VERIFIED', errorMessage);
      });

      await _login(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.FORBIDDEN);
      expect(mockJson).toHaveBeenCalledWith({
        details: null,
        message: errorMessage,
        type: 'ForbiddenError'
      });
    });

    it('should handle validation errors and return 400 status', async () => {
      const validationError = createDtoValidationError([
        { property: 'email', constraints: { isEmail: 'email must be a valid email address' } }
      ]);

      (AuthenticateUserDTO.validate as any).mockRejectedValue(validationError);

      await _login(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith({
        details: { email: ['email must be a valid email address'] },
        message: "Validation failed",
        type: 'ValidationError'
      });
    });

    it('should handle unexpected errors and return 500 status', async () => {
      const error = new Error('Unexpected error');
      (mockLoginUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockLoginUserUseCase.__trigger('ERROR', error);
      });

      await _login(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        details: error,
        message: error.message,
        type: 'InternalServerError'
      });
    });
  });

  // --- Test Cases for logout ---
  describe('logout', () => {
    let _logout: ControllerMethod;
    let logoutData: {
      accessToken: string;
      refreshToken: string;
    };

    beforeEach(() => {
      _logout = authController.logout()._logout;

      logoutData = {
        accessToken: faker.string.alphanumeric(40),
        refreshToken: faker.string.alphanumeric(40)
      };

      mockRequest.headers = { authorization: `Bearer ${logoutData.accessToken}` };
      mockRequest.body = { refreshToken: logoutData.refreshToken };

      // Mock DTO validation success by default
      (LogoutRequestDTO.validate as any).mockResolvedValue(logoutData);

      // Mock Use Case execution to trigger SUCCESS by default
      (mockLogoutUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockLogoutUserUseCase.__trigger('SUCCESS', { message: 'Logout successful' });
      });
    });

    it('should logout user successfully and return 204 status', async () => {
      await _logout(mockRequest, mockResponse, mockNext);

      expect(LogoutRequestDTO.validate).toHaveBeenCalledWith(logoutData);
      expect(LogoutUser).toHaveBeenCalledWith(mockTokenBlackList, mockConfig, mockLogger);
      expect(mockLogoutUserUseCase.execute).toHaveBeenCalledWith(logoutData);
      expect(mockStatus).toHaveBeenCalledWith(status.NO_CONTENT);
      expect(mockJson).toHaveBeenCalledWith({
        data: { message: 'Logout successful' }
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle invalid token error and return 400 status', async () => {
      const errorMessage = 'Invalid token provided';
      (mockLogoutUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockLogoutUserUseCase.__trigger('INVALID_TOKEN', errorMessage);
      });

      await _logout(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith({
        details: errorMessage,
        message: "Validation failed",
        type: 'ValidationError'
      });
    });

    it('should handle missing tokens and process with what is available', async () => {
      mockRequest.headers = {};
      mockRequest.body = {};

      const partialLogoutData = { accessToken: undefined, refreshToken: undefined };
      (LogoutRequestDTO.validate as any).mockResolvedValue(partialLogoutData);

      await _logout(mockRequest, mockResponse, mockNext);

      expect(LogoutRequestDTO.validate).toHaveBeenCalledWith(partialLogoutData);
      expect(mockLogoutUserUseCase.execute).toHaveBeenCalledWith(partialLogoutData);
    });

    it('should handle validation errors and return 400 status', async () => {
      const validationError = createDtoValidationError([
        { property: 'accessToken', constraints: { isNotEmpty: 'accessToken should not be empty' } }
      ]);

      (LogoutRequestDTO.validate as any).mockRejectedValue(validationError);

      await _logout(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
    });

    it('should handle unexpected errors and return 500 status', async () => {
      const error = new Error('Unexpected error');
      (mockLogoutUserUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockLogoutUserUseCase.__trigger('ERROR', error);
      });

      await _logout(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        details: error,
        message: error.message,
        type: 'InternalServerError'
      });
    });
  });

  // --- Test Cases for forgotPassword ---
  describe('forgotPassword', () => {
    let _forgotPassword: ControllerMethod;
    let forgotPasswordData: {
      email: string;
    };

    beforeEach(() => {
      _forgotPassword = authController.forgotPassword()._forgotPassword;

      forgotPasswordData = {
        email: faker.internet.email()
      };

      mockRequest.body = forgotPasswordData;

      // Mock DTO validation success by default
      (EmailUserDTO.validate as any).mockResolvedValue(forgotPasswordData);

      // Mock Use Case execution to trigger SUCCESS by default
      (mockForgotPasswordUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockForgotPasswordUseCase.__trigger('SUCCESS');
      });
    });

    it('should process forgot password request successfully and return 200 status', async () => {
      await _forgotPassword(mockRequest, mockResponse, mockNext);

      expect(EmailUserDTO.validate).toHaveBeenCalledWith(forgotPasswordData);
      expect(ForgotPassword).toHaveBeenCalledWith(
        mockUserRepository,
        mockTokenRepository,
        mockTokenGenerator,
        mockConfig,
        mockLogger
      );
      expect(mockForgotPasswordUseCase.execute).toHaveBeenCalledWith(forgotPasswordData);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({
        data: { message: 'Password reset instructions sent to your email' }
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle user not found error and return 404 status', async () => {
      const errorMessage = 'No user found with this email';
      (mockForgotPasswordUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockForgotPasswordUseCase.__trigger('USER_NOT_FOUND', errorMessage);
      });

      await _forgotPassword(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith({
        details: null,
        message: errorMessage,
        type: 'NotFoundError'
      });
    });

    it('should handle unverified account and return 403 status', async () => {
      const errorMessage = 'Account not verified. Please verify your email before resetting password.';
      (mockForgotPasswordUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockForgotPasswordUseCase.__trigger('ACCOUNT_NOT_VERIFIED', errorMessage);
      });

      await _forgotPassword(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.FORBIDDEN);
      expect(mockJson).toHaveBeenCalledWith({
        details: null,
        message: errorMessage,
        type: 'ForbiddenError'
      });
    });

    it('should handle validation errors and return 400 status', async () => {
      const validationError = createDtoValidationError([
        { property: 'email', constraints: { isEmail: 'email must be a valid email address' } }
      ]);

      (EmailUserDTO.validate as any).mockRejectedValue(validationError);

      await _forgotPassword(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
    });

    it('should handle unexpected errors and return 500 status', async () => {
      const error = new Error('Unexpected error');
      (mockForgotPasswordUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockForgotPasswordUseCase.__trigger('ERROR', error);
      });

      await _forgotPassword(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        details: error,
        message: error.message,
        type: 'InternalServerError'
      });
    });
  });

  // --- Test Cases for resetPassword ---
  describe('resetPassword', () => {
    let _resetPassword: ControllerMethod;
    let resetPasswordData: {
      token: string;
      password: string;
      repeatPassword: string;
    };

    beforeEach(() => {
      _resetPassword = authController.resetPassword()._resetPassword;

      resetPasswordData = {
        token: faker.string.alphanumeric(32),
        password: faker.internet.password({ length: 12 }),
        repeatPassword: faker.internet.password({ length: 12 })
      };

      mockRequest.body = resetPasswordData;

      // Mock DTO validation success by default
      (ResetPasswordDTO.validate as any).mockResolvedValue(resetPasswordData);

      // Mock Use Case execution to trigger SUCCESS by default
      (mockResetPasswordUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockResetPasswordUseCase.__trigger('SUCCESS', {
          message: 'Password reset successfully'
        });
      });
    });

    it('should reset password successfully and return 200 status', async () => {
      await _resetPassword(mockRequest, mockResponse, mockNext);

      expect(ResetPasswordDTO.validate).toHaveBeenCalledWith(resetPasswordData);
      expect(ResetPassword).toHaveBeenCalledWith(
        mockUserRepository,
        mockTokenRepository,
        mockPasswordHasher,
        mockLogger
      );
      expect(mockResetPasswordUseCase.execute).toHaveBeenCalledWith(resetPasswordData);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({
        data: { message: 'Password reset successfully' }
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle token not found error and return 404 status', async () => {
      const errorMessage = 'Reset token not found';
      (mockResetPasswordUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockResetPasswordUseCase.__trigger('TOKEN_NOT_FOUND', errorMessage);
      });

      await _resetPassword(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith({
        details: null,
        message: errorMessage,
        type: 'NotFoundError'
      });
    });

    it('should handle token expired error and return 400 status', async () => {
      const errorMessage = 'Reset token has expired';
      (mockResetPasswordUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockResetPasswordUseCase.__trigger('TOKEN_EXPIRED', errorMessage);
      });

      await _resetPassword(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith({
        details: errorMessage,
        message: "Validation failed",
        type: 'ValidationError'
      });
    });

    it('should handle invalid token error and return 400 status', async () => {
      const errorMessage = 'Invalid reset token';
      (mockResetPasswordUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockResetPasswordUseCase.__trigger('INVALID_TOKEN', errorMessage);
      });

      await _resetPassword(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith({
        details: errorMessage,
        message: "Validation failed",
        type: 'ValidationError'
      });
    });

    it('should handle validation errors and return 400 status', async () => {
      const validationError = createDtoValidationError([
        { property: 'password', constraints: { minLength: 'password must be at least 8 characters' } }
      ]);

      (ResetPasswordDTO.validate as any).mockRejectedValue(validationError);

      await _resetPassword(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
    });

    it('should handle unexpected errors and return 500 status', async () => {
      const error = new Error('Unexpected error');
      (mockResetPasswordUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockResetPasswordUseCase.__trigger('ERROR', error);
      });

      await _resetPassword(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        details: error,
        message: error.message,
        type: 'InternalServerError'
      });
    });
  });

// --- Test Cases for sendEmailOnUserCreation ---
  describe('sendEmailOnUserCreation', () => {
    let _sendEmailOnUserCreation: ControllerMethod;
    let emailData: {
      email: string;
    };

    beforeEach(() => {
      _sendEmailOnUserCreation = authController.sendEmailOnUserCreation()._sendEmailOnUserCreation;

      emailData = {
        email: faker.internet.email()
      };

      mockRequest.body = emailData;

      // Mock DTO validation success by default
      (EmailUserDTO.validate as any).mockResolvedValue(emailData);

      // Mock Use Case execution to trigger SUCCESS by default
      (mockSendEmailOnUserCreationUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockSendEmailOnUserCreationUseCase.__trigger('SUCCESS', {
          email: emailData.email
        });
      });
    });

    it('should send verification email successfully and return 200 status', async () => {
      await _sendEmailOnUserCreation(mockRequest, mockResponse, mockNext);

      expect(EmailUserDTO.validate).toHaveBeenCalledWith(emailData);
      expect(SendEmailOnUserCreation).toHaveBeenCalledWith(
        mockTokenRepository,
        mockUserRepository,
        mockEmailService,
        mockConfig,
        mockLogger
      );
      expect(mockSendEmailOnUserCreationUseCase.execute).toHaveBeenCalledWith(emailData);
      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({
        data: {
          message: 'Verification email sent successfully',
          email: emailData.email
        }
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle already verified user and return 200 status', async () => {
      (mockSendEmailOnUserCreationUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockSendEmailOnUserCreationUseCase.__trigger('USER_ALREADY_VERIFIED', {
          email: emailData.email
        });
      });

      await _sendEmailOnUserCreation(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.OK);
      expect(mockJson).toHaveBeenCalledWith({
        data: {
          message: 'User is already verified',
          email: emailData.email
        }
      });
    });

    it('should handle user not found error and return 404 status', async () => {
      const errorMessage = 'User not found';
      (mockSendEmailOnUserCreationUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockSendEmailOnUserCreationUseCase.__trigger('USER_NOT_FOUND', errorMessage);
      });

      await _sendEmailOnUserCreation(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith({
        details: null,
        message: errorMessage,
        type: 'NotFoundError'
      });
    });

    it('should handle availability error and return 500 status', async () => {
      const error = new Error('Email service unavailable');
      (mockSendEmailOnUserCreationUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockSendEmailOnUserCreationUseCase.__trigger('AVAILABILITY_ERROR', error);
      });

      await _sendEmailOnUserCreation(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        details: error,
        message: error.message,
        type: 'InternalServerError'
      });
    });

    it('should handle validation errors and return 400 status', async () => {
      const validationError = createDtoValidationError([
        { property: 'email', constraints: { isEmail: 'email must be a valid email address' } }
      ]);

      (EmailUserDTO.validate as any).mockRejectedValue(validationError);

      await _sendEmailOnUserCreation(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.BAD_REQUEST);
    });

    it('should handle unexpected errors and return 500 status', async () => {
      const error = new Error('Unexpected error');
      (mockSendEmailOnUserCreationUseCase.execute as jest.Mock).mockImplementation(async () => {
        mockSendEmailOnUserCreationUseCase.__trigger('ERROR', error);
      });

      await _sendEmailOnUserCreation(mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(status.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        details: error,
        message: error.message,
        type: 'InternalServerError'
      });
    });
  });
});
