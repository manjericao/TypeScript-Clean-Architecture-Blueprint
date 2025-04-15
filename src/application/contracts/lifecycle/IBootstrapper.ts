/**
 * Interface representing a bootstrapper component.
 *
 * A bootstrapper is responsible for initializing or setting up an application, service, or module. It abstracts the bootstrapping logic and can be implemented to perform synchronous or asynchronous initialization tasks.
 */
export interface IBootstrapper {
  /**
   * Initializes and sets up the necessary configurations or components needed
   * for the application to run. This method might perform asynchronous
   * operations depending on the implementation.
   *
   * @return {void | Promise<void>} Returns nothing if synchronous, or a Promise
   *         that resolves when the asynchronous setup is complete.
   */
  bootstrap(): void | Promise<void>;
}
