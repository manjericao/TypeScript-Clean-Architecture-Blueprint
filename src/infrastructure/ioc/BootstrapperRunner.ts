import { ServiceIdentifier } from 'inversify';

import { IBootstrapper } from '@application/contracts/lifecycle';
import { container } from '@infrastructure/ioc/Container';
import { Types } from '@interface/types';

/**
 * Executes all registered bootstraps.
 * Each bootstrapper is retrieved from the dependency injection container, and its `bootstrap` method
 * is invoked asynchronously.
 * This ensures initialization processes
 * defined in bootstraps are executed.
 *
 * @return {Promise<void>} A promise that resolves when all bootstraps have been executed successfully.
 */
export async function runBootstrappers(): Promise<void> {
  const bootstrappers = container.getAll<IBootstrapper>(
    Types.Bootstrapper as ServiceIdentifier<IBootstrapper>
  );
  for (const bootstrapper of bootstrappers) {
    await bootstrapper.bootstrap();
  }
}
