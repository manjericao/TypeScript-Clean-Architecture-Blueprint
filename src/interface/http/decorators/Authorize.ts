import { UserRole } from '@enterprise/enum';

/**
 * A decorator function to authorize access to methods based on user roles.
 *
 * @param {UserRole[]} roles - An array of roles allowed to access the method.
 * @return {MethodDecorator} A function that modifies the method to include role-based authorization and metadata.
 */
export function Authorize(roles: UserRole[]): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = function (...args: unknown[]) {
      return originalMethod.apply(this, args);
    };

    Reflect.defineMetadata('roles', roles, target, propertyKey);

    return descriptor;
  };
}
