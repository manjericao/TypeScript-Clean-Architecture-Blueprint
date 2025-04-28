/**
 * Represents a standardized structure for a successful response.
 *
 * @template T - The type of data contained in the response.
 *
 * @property {T} data - The main content or payload of the response.
 * @property {Object} [meta] - Optional metadata providing additional information about the response.
 * @property {number} [meta.page] - The current page number, if pagination is applied.
 * @property {number} [meta.limit] - The maximum number of items per page, if pagination is applied.
 * @property {number} [meta.total] - The total number of items available, if applicable.
 */
export interface SuccessResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

/**
 * Represents an error response structure.
 *
 * This interface is used to provide detailed information about an error,
 * including its type, additional details, and an optional error message.
 *
 * Fields:
 * - type: Specifies the type or category of the error.
 * - details: Contains additional data or context specific to the error.
 * - message (optional): A human-readable message describing the error.
 */
export interface ErrorResponse {
  type: string;
  details: unknown;
  message?: string;
}
