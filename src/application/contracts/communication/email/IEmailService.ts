/**
 * Email options interface
 */
export interface EmailOptions {
  /**
   * Represents a recipient or list of recipients.
   * The variable can hold either a single recipient as a string or
   * multiple recipients as an array of strings.
   */
  to: string | string[];

  /**
   * Represents the subject associated with a specific context or entity.
   * It typically contains a string value that describes or categorizes
   * the topic or focal point being referenced.
   */
  subject: string;

  /**
   * An optional string variable that can hold text data.
   * It may be undefined if no value is assigned.
   */
  text?: string;

  /**
   * Represents an optional HTML string. This variable can be used to store
   * HTML content that may be dynamically rendered or processed within the
   * application. If no value is provided, the variable will be undefined.
   */
  html?: string;

  /**
   * Represents an optional template string that can be used
   * for various purposes such as formatting, rendering,
   * or templating content dynamically.
   */
  template?: string;

  /**
   * Represents an optional context object that provides additional information
   * or parameters to be used in a specific operation or function. The keys
   * and values are dynamically defined based on the intended use case.
   *
   * This is a flexible structure where the keys are strings, and the values
   * can be of any type.
   */
  context?: Record<string, unknown>;
}

/**
 * Interface for email service operations
 */
export interface IEmailService {
  /**
   * Sends an email using the specified options
   *
   * @param options - The email sending options
   * @returns A promise that resolves when the email is sent
   */
  sendEmail(options: EmailOptions): Promise<void>;

  /**
   * Verifies connection configuration with the email provider
   *
   * @returns A promise that resolves if the connection is working,
   *          or rejects with an error if there's a connection issue
   */
  verify(): Promise<boolean>;
}
