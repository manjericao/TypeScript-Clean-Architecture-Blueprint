/**
 * Interface representing a logger for handling log messages.
 *
 * Provides methods to log messages at various levels such as info, debug, and error.
 */
export interface ILogger {
  /**
   * Logs an informational message to the console or a logging system.
   *
   * @param {string} message - The main message to be logged.
   * @param {...unknown} args - Additional arguments to format or append to the message.
   * @return {void}
   */
  info(message: string, ...args: unknown[]): void;

  /**
   * Logs a debug-level message along with optional additional arguments.
   * This method is typically used for providing detailed information
   * helpful for debugging and tracing code execution.
   *
   * @param {string} message - The main debug message to log.
   * @param {...unknown} args - Additional arguments or data to include in the log.
   * @return {void} No return value.
   */
  debug(message: string, ...args: unknown[]): void;

  /**
   * Logs a warning message with optional additional arguments.
   *
   * @param {string} message - The primary warning message to log.
   * @param {...unknown[]} args - Additional arguments or data to include with the warning log.
   * @return {void} Does not return a value.
   */
  warn?(message: string, ...args: unknown[]): void;

  /**
   * Logs an error message with optional additional arguments for debugging purposes.
   *
   * @param {string} message - The error message to log.
   * @param {...unknown} args - Additional arguments to provide context or details about the error.
   * @return {void} No value is returned.
   */
  error(message: string, ...args: unknown[]): void;
}
