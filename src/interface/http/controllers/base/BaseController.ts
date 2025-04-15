import status from 'http-status';
import { SuccessResponse, ErrorResponse } from '@interface/http/types/Response';
import { HttpResponse } from '@interface/http/types/Http';

/**
 * BaseController is an abstract class that provides common utility methods
 * to handle HTTP responses in a standardized manner, including success and
 * various types of error responses.
 *
 * This class is designed to be extended by other controllers to provide
 * reusable response handling logic.
 */
export abstract class BaseController {
  /**
   * Handles successful HTTP responses by formatting the provided data and metadata into
   * a standardized success response object and sending it to the client.
   *
   * @param {HttpResponse} response - The HTTP response object used to send the response.
   * @param {T} data - The data to be included in the success response.
   * @param {number} [statusCode=status.OK] - The HTTP status code for the response, defaulting to 200 (OK).
   * @param {Object} [meta] - Optional metadata to include in the response, such as pagination details.
   * @param {number} [meta.page] - The current page number of paginated results.
   * @param {number} [meta.limit] - The maximum number of items per page in paginated results.
   * @param {number} [meta.total] - The total number of items available for the query.
   *
   * @return {void} This method does not return a value but sends a JSON response to the client.
   */
  protected handleSuccess<T>(
    response: HttpResponse,
    data: T,
    statusCode: number = status.OK,
    meta?: { page?: number; limit?: number; total?: number }
  ): void {
    const successResponse: SuccessResponse<T> = {
      data,
      ...(meta && { meta })
    };

    response.status(statusCode).json(successResponse);
  }

  /**
   * Handles errors by creating an error response and sending it back with the specified status code.
   *
   * @param {HttpResponse} response - The HTTP response object used to send the error response.
   * @param {number} [statusCode=status.INTERNAL_SERVER_ERROR] - The HTTP status code to be sent with the error response.
   * @return {function(unknown): void} A function that takes an error object, formats it into an error response,
   * and sends it back to the client.
   */
  protected handleError(
    response: HttpResponse,
    statusCode: number = status.INTERNAL_SERVER_ERROR
  ): (error: unknown) => void {
    return (error: unknown): void => {
      const errorResponse: ErrorResponse = {
        type: 'InternalServerError',
        details: error,
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      };

      response.status(statusCode).json(errorResponse);
    };
  }

  /**
   * Handles a not found error by sending a standardized error response.
   *
   * @param {HttpResponse} response - The HTTP response object used to send the error response.
   * @param {string} [message='Resource not found'] - The error message to include in the response.
   * @return {void} This method does not return a value.
   */
  protected handleNotFound(
    response: HttpResponse,
    message: string = 'Resource not found'
  ): void {
    const errorResponse: ErrorResponse = {
      type: 'NotFoundError',
      details: null,
      message
    };

    response.status(status.NOT_FOUND).json(errorResponse);
  }

  /**
   * Handles validation errors by responding with a formatted error response.
   *
   * @param {HttpResponse} response - The HTTP response object used to send the error response.
   * @param {unknown} details - The details of the validation error to be included in the response.
   * @return {void} Does not return a value; sends an HTTP response with a validation error.
   */
  protected handleValidationError(
    response: HttpResponse,
    details: unknown
  ): void {
    const errorResponse: ErrorResponse = {
      type: 'ValidationError',
      details,
      message: 'Validation failed'
    };

    response.status(status.BAD_REQUEST).json(errorResponse);
  }

  /**
   * Handles conflicts by sending an appropriate error response with status code 409 (Conflict).
   *
   * @param {HttpResponse} response - The HTTP response object used to send the error response.
   * @param {string} [message='Resource already exists'] - The conflict error message to be included in the response.
   * @return {void} - This method does not return a value but modifies the HTTP response.
   */
  protected handleConflict(
    response: HttpResponse,
    message: string = 'Resource already exists'
  ): void {
    const errorResponse: ErrorResponse = {
      type: 'ConflictError',
      details: null,
      message
    };

    response.status(status.CONFLICT).json(errorResponse);
  }

  /**
   * Handles unauthorized access by setting the response with an unauthorized status code
   * and a JSON error message.
   *
   * @param {HttpResponse} response - The HTTP response object to send the unauthorized status and message.
   * @param {string} message - The custom error message to include in the response body.
   * @return {void} This method does not return any value.
   */
  protected handleUnauthorized(response: HttpResponse, message: string): void {
    response.status(status.UNAUTHORIZED).json({
      type: 'UnauthorizedError',
      message
    });
  }

  /**
   * Handles forbidden access by setting the response status to 403 (Forbidden)
   * and sending a JSON response with the specified error message.
   *
   * @param {HttpResponse} response - The response object used to send the HTTP response.
   * @param {string} message - The error message to include in the JSON response.
   * @return {void} Does not return a value.
   */
  protected handleForbidden(response: HttpResponse, message: string): void {
    response.status(status.FORBIDDEN).json({
      type: 'ForbiddenError',
      message
    });
  }
}
