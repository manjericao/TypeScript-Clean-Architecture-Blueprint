/**
 * Interface representing a server.
 * Provides the blueprint for starting the server.
 */
export interface IServer {
  /**
   * Initiates the process or operation associated with the current instance.
   * This method performs the necessary steps to start the functionality asynchronously.
   *
   * @return {Promise<void>} A promise that resolves when the operation successfully starts or rejects if an error occurs.
   */
  start(): Promise<void>;
}
