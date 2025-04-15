import { ClassConstructor } from 'class-transformer';
import { DTOValidationError } from '@enterprise/dto/errors';

/**
 * Base Data Transfer Object class that provides common validation functionality.
 *
 * This abstract class implements a generic validate method that can be used by all DTOs
 * to transform and validate incoming data according to their specific validation rules.
 */
export abstract class BaseDTO {
  /**
   * Validates data against a DTO class.
   * This is a non-static method that can be used by static methods in derived classes.
   */
  protected static async validateData<T>(
    dtoClass: ClassConstructor<T>,
    data: Record<string, unknown>
  ): Promise<T> {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');

    const dto = plainToInstance(dtoClass, data, {
      excludeExtraneousValues: true
    });

    const errors = await validate(dto as object);

    if (errors.length > 0) {
      throw new DTOValidationError(errors);
    }

    return dto;
  }
}
