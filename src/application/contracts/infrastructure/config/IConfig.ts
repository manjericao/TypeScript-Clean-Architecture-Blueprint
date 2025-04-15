/**
 * Interface representing the configuration settings for the application.
 */
export interface IConfig {
  /**
   * Represents the current environment configuration or context in which the application is running.
   * This is a read-only variable, which means its value cannot be changed after initialization.
   */
  readonly env: string;

  /**
   * A read-only boolean variable that indicates whether debugging mode is enabled for Mongoose.
   * When set to `true`, Mongoose will output detailed debugging information, such as query execution details,
   * to the console or the specified logging mechanism. Typically used during development or troubleshooting
   * to help trace database operations and identify issues.
   */
  readonly MONGOOSE_DEBUG: boolean;

  /**
   * Configuration object for JSON Web Token (JWT) settings.
   *
   * @property {string} secret - The secret key used for signing and verifying JWT tokens.
   * @property {number} accessExpirationMinutes - The duration in minutes for which an access token remains valid.
   * @property {number} refreshExpirationDays - The duration in days for which a refresh token remains valid.
   * @property {number} resetPasswordExpirationMinutes - The duration in minutes for which a reset password token remains valid.
   * @property {number} verifyEmailExpirationMinutes - The duration in minutes for which an email verification token remains valid.
   */
  readonly jwt: {
    secret: string;
    accessExpirationMinutes: number;
    refreshExpirationDays: number;
    resetPasswordExpirationMinutes: number;
    verifyEmailExpirationMinutes: number;
  };

  /**
   * Represents the database connection string.
   * This is a read-only property that typically contains
   * the necessary information for connecting to a database,
   * such as the server address, database name, and authentication credentials.
   */
  readonly db: string;

  /**
   * Configuration object for database connection settings.
   * Contains options to specify the connection behavior of the database driver.
   *
   * @property {boolean} useNewUrlParser - Determines whether to use the new URL parser provided by the database driver.
   * @property {boolean} useUnifiedTopology - Enables the unified topology layer to simplify connection management.
   */
  readonly db_config: {
    useNewUrlParser: boolean;
    useUnifiedTopology: boolean;
  };

  /**
   * Configuration object for storage.
   *
   * This object defines the structure required for specifying storage
   * details, including storage type and specific configurations for AWS storage.
   *
   * Properties:
   * - `type`: A string representing the type of storage used.
   *
   * AWS-specific Configuration:
   * - `aws.bucketName`: The name of the S3 bucket. Can be undefined if not configured.
   * - `aws.accessKeyId`: AWS access key ID for authentication. Can be undefined if not configured.
   * - `aws.secretAccessKey`: AWS secret access key for authentication. Can be undefined if not configured.
   * - `aws.region`: The AWS region where the S3 bucket is located. Can be undefined if not configured.
   */
  readonly storage: {
    type: string;
    aws: {
      bucketName: string | undefined;
      accessKeyId: string | undefined;
      secretAccessKey: string | undefined;
      region: string | undefined;
    };
  };

  /**
   * Represents the server configuration details.
   *
   * @readonly
   * @property {string} protocol - The communication protocol used by the server (e.g., HTTP, HTTPS).
   * @property {string} host - The hostname or IP address of the server.
   * @property {number} port - The port number on which the server is running.
   * @property {string} version - The version of the server or its API.
   */
  readonly server: {
    protocol: string;
    host: string;
    port: number;
    version: string;
  };

  /**
   * Configuration object for an SMTP (Simple Mail Transfer Protocol) server.
   * This object contains the necessary fields for establishing a connection
   * and sending emails through an SMTP server.
   *
   * @property {string} host - The hostname or IP address of the SMTP server.
   * @property {number} port - The port number used to connect to the SMTP server.
   * @property {boolean} secure - Indicates whether to use a secure connection (e.g., SSL/TLS).
   * @property {boolean} debug - Determines if debugging information should be logged.
   * @property {string} username - The username for authenticating with the SMTP server.
   * @property {string} password - The password for authenticating with the SMTP server.
   * @property {string} from - The email address to use as the sender in outgoing emails.
   */
  readonly smtp: {
    host: string;
    port: number;
    secure: boolean;
    debug: boolean;
    username: string;
    password: string;
    from: string;
  };

  /**
   * Configuration object for connecting to a Redis instance.
   *
   * @property {string} host - The hostname or IP address of the Redis server.
   * @property {number} port - The port number on which the Redis server is running.
   * @property {string} [password] - Optional password for authenticating with the Redis server.
   * @property {number} [db] - Optional database index to select after connecting to the Redis server.
   */
  readonly redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}
