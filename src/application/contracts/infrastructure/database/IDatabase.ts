/**
 * Interface representing a database connection.
 */
export interface IDatabase {
  /**
   * Establishes a connection to the target resource.
   * This asynchronous method initiates the process of connecting,
   * ensuring the necessary setup and configurations are completed.
   *
   * @return {Promise<void>} A promise that resolves once the connection is successfully established.
   */
  connect(): Promise<void>;

  /**
   * Disconnects the current connection, releasing any resources or closing
   * any open connections associated with it.
   *
   * @return {Promise<void>} A Promise that resolves when the disconnection
   * process is complete, or rejects if an error occurs during disconnection.
   */
  disconnect(): Promise<void>;
}
