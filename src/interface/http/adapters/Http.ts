/**
 * Interface representing the parameters for a request.
 *
 * The `RequestParams` interface defines optional properties
 * that can be used to customize a request.
 * These parameters include identifiers, pagination options, search and filtering
 * controls, and sorting preferences.
 *
 * Optional Properties:
 *
 * - `id`: A unique identifier for the resource.
 * - `email`: Email address for filtering or identification purposes.
 * - `page`: The page number for paginated results.
 * - `limit`: The number of items to return per page in paginated results.
 * - `offset`: The number of items to skip before starting pagination.
 * - `search`: A search query string to filter results.
 * - `sort`: The field by which to sort the results.
 * - `order`: The order in which to sort results. Typically, `asc` or `desc`.
 * - `fields`: A comma-separated list of fields to include in the response.
 * - `include`: A list of related data or resources to include in the response.
 * - `exclude`: A list of fields or related data to exclude from the response.
 */
export interface RequestParams {
  id?: string;
  email?: string;
  page?: number;
  limit?: number;
  offset?: number;
  search?: string;
  sort?: string;
  order?: string;
  fields?: string;
  include?: string;
  exclude?: string;
}

/**
 * Represents an HTTP request entity containing the properties used to handle requests.
 *
 * This interface is primarily designed to be used in HTTP services or frameworks for
 * managing request input data such as body, parameters, query, and headers.
 *
 * Optional properties may not always be present depending on the type of request being made.
 */
export interface HttpRequest {
  body?: unknown;
  params: RequestParams;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Represents a response object with a method for sending JSON data.
 *
 * This interface provides a structure for handling responses in which data
 * is returned in JSON format.
 * It is commonly used in web server frameworks for sending HTTP responses in standardized JSON format.
 *
 * Methods:
 * - `json(data: unknown): void`
 *   Sends the provided data as a JSON response.
 */
export interface ResponseObject {
  json: (data: unknown) => void;
}

/**
 * Represents an HTTP response object with methods to handle the response status.
 */
export interface HttpResponse {
  status: (code: number) => ResponseObject;
}

/**
 * HttpNext is a type representing a function that is called to signal the
 * continuation of middleware processing in an HTTP request-response cycle.
 *
 * It is commonly used in middleware functions to allow the next middleware
 * in the stack to execute.
 * Calling this function indicates that the current middleware has completed its processing.
 *
 * Usage of the HttpNext function allows for asynchronous operations
 * and ensures a sequential flow of middleware execution.
 * If not called, the middleware chain is halted.
 */
export type HttpNext = () => void;

/**
 * Represents a controller method in a web application that handles HTTP requests.
 * This method is expected to process the incoming HTTP request, generate the appropriate
 * HTTP response, and call the next middleware function if applicable.
 *
 * The method is asynchronous, returning a Promise that resolves upon completion of
 * request handling.
 *
 * @callback ControllerMethod
 * @param {HttpRequest} request - The incoming HTTP request object, containing details such as headers, body, and query parameters.
 * @param {HttpResponse} response - The outgoing HTTP response object, used to send data back to the client.
 * @param {HttpNext} next - The next middleware function,
 * which can be called to pass control to the later handler.
 * @returns {Promise<void>} A Promise that resolves when the method completes its operation.
 */
export type ControllerMethod = (
  request: HttpRequest,
  response: HttpResponse,
  next: HttpNext
) => Promise<void>;
