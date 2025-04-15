import { ServiceIdentifier } from 'inversify';
import { container } from '@infrastructure/ioc/Container';
import { Types } from '@interface/types';
import { IBootstrapper } from '@application/contracts/lifecycle';

/**
 * Executes all registered bootstrappers. Each bootstrapper is retrieved
 * from the dependency injection container and its `bootstrap` method
 * is invoked asynchronously. This ensures initialization processes
 * defined in bootstrappers are executed.
 *
 * @return {Promise<void>} A promise that resolves when all bootstrappers have been executed successfully.
 */
export async function runBootstrappers(): Promise<void> {
  const bootstrappers = container.getAll<IBootstrapper>(
    Types.Bootstrapper as ServiceIdentifier<IBootstrapper>
  );
  for (const bootstrapper of bootstrappers) {
    await bootstrapper.bootstrap();
  }
}
