import { validateOrReject, ValidationError } from 'class-validator';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { ITransformer } from '@interface/http/transformer';

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

  serialize<T extends object>(data: T | T[]): unknown {
    return instanceToPlain(data, { excludeExtraneousValues: true });
  }

  private formatValidationErrors(errors: ValidationError[]): string {
    const messages = errors
      .map(error => (error.constraints ? Object.values(error.constraints) : []))
      .flat()
      .filter(Boolean);
    return messages.join(', ');
  }
}
