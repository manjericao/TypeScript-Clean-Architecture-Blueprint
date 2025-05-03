import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';

import { ITransformer } from 'src/application/contracts/transformer';

export class BaseTransformer implements ITransformer {
  async transformToDto<T extends object, R extends object>(
    data: T,
    dtoClass: new () => R
  ): Promise<R> {
    const transformed = plainToInstance(dtoClass, data, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true
    });

    try {
      await validateOrReject(transformed);
      return transformed;
    } catch (errors: unknown) {
      if (Array.isArray(errors) && errors.length > 0 && 'constraints' in errors[0]) {
        const errorMessage = this.formatValidationErrors(errors as ValidationError[]);
        const error = new Error(errorMessage);
        (error as Error & { statusCode?: number }).statusCode = 400;
        throw error;
      }
      throw errors;
    }
  }

  serialize<T extends object, R = string>(data: T | T[]): R {
    return instanceToPlain(data, { excludeExtraneousValues: true }) as R;
  }

  async deserialize<T extends object>(data: unknown, targetClass: new () => T): Promise<T | T[]> {
    const transformed = plainToInstance(targetClass, data, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true
    });

    if (Array.isArray(transformed)) {
    } else if (typeof transformed !== 'object' || transformed === null) {
      const error = new Error('Invalid data type after transformation');
      (error as Error & { statusCode?: number }).statusCode = 400;
      throw error;
    }

    try {
      if (Array.isArray(transformed)) {
        await Promise.all(
          transformed.map((item) => {
            if (typeof item === 'object' && item !== null) {
              return validateOrReject(item as T);
            }
            throw new Error('Invalid item type after transformation');
          })
        );
        return transformed;
      } else {
        await validateOrReject(transformed);
        return transformed;
      }
    } catch (errors: unknown) {
      if (Array.isArray(errors) && errors.length > 0 && 'constraints' in errors[0]) {
        const errorMessage = this.formatValidationErrors(errors as ValidationError[]);
        const error = new Error(errorMessage);
        (error as Error & { statusCode?: number }).statusCode = 400;
        throw error;
      }
      throw errors;
    }
  }

  private formatValidationErrors(errors: ValidationError[]): string {
    const messages = errors
      .map((error) => (error.constraints ? Object.values(error.constraints) : []))
      .flat()
      .filter(Boolean);
    return messages.join(', ');
  }
}
