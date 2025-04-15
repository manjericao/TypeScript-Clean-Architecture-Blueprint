/**
 * Data Transfer Object (DTO) representing pagination information.
 *
 * @interface
 */
export interface PaginationDTO<T> {
  /**
   * The body of the response, representing the paginated data.
   */
  body: T[]

  /**
   * The total number of items in the dataset.
   */
  total: number

  /**
   * The current page number.
   */
  page: number

  /**
   * Represents the maximum value or boundary for a particular operation or functionality.
   * This variable is used to impose a restriction or set an upper threshold.
   */
  limit: number

  /**
   * The last page number in the pagination.
   */
  last_page: number
}
