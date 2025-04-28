/**
 * Interface representing a transformer for data operations, such as converting
 * objects to Data Transfer Objects (DTOs) or serializing data.
 */
export interface ITransformer {
  /**
   * Transforms an object of type T into an instance of a specified DTO class of type R.
   *
   * @param {T} data - The source object that needs to be transformed.
   * @param {new () => R} dtoClass - The constructor of the destination DTO class.
   * @return {Promise<R>} A promise that resolves to an instance of the DTO class populated with the transformed data.
   */
  transformToDto<T extends object, R extends object>(data: T, dtoClass: new () => R): Promise<R>;

  /**
   * Serializes the provided data, converting it into a format suitable for storage or transmission.
   *
   * @param {T | T[]} data - The object or array of objects to be serialized.
   * @return {R} The serialized representation of the input data.
   */
  serialize<T extends object, R = string>(data: T | T[]): R;

  /**
   * Deserializes data from a storage or transmission format back into objects.
   *
   * @param {unknown} data - The serialized data to convert back into objects.
   * @param {new () => T} targetClass - The class to instantiate with the deserialized data.
   * @return {Promise<T | T[]>} A promise that resolves to the deserialized object(s).
   */
  deserialize<T extends object>(data: unknown, targetClass: new () => T): Promise<T | T[]>;
}
