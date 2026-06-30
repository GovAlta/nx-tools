import { ProjectConfiguration } from '@nx/devkit';
import { ApplicationType } from '../generators/deployment/schema';

/**
 * Detect the application type from the project's build executor.
 *
 * Shared by the deployment and sandbox generators so they stay in sync as new
 * Nx build executors appear (e.g. Vite/Rspack for frontends).
 */
export function detectApplicationType(
  config: ProjectConfiguration
): ApplicationType | undefined {
  const build = config.targets?.build;
  switch (build?.executor) {
    case '@nx/web:webpack':
    case '@angular-devkit/build-angular:browser':
    case '@nx/vite:build':
    case '@nx/rspack:rspack':
      return 'frontend';
    case '@nx/node:build':
      return 'node';
    case '@nx-dotnet/core:build':
      return 'dotnet';
    case '@nx/webpack:webpack':
      // The generic webpack executor builds both node and browser apps.
      return build.options?.target === 'node' ? 'node' : 'frontend';
    default:
      return undefined;
  }
}

/**
 * The build output directory for a project, relative to the workspace root.
 *
 * Read from the project's `build` target so the generated Dockerfile mirrors
 * the workspace's actual layout (e.g. `dist/apps/<project>` or
 * `packages/<project>/dist`) instead of assuming a fixed path. Falls back to
 * `dist/<projectRoot>`, the Nx default, when the target declares no outputPath.
 */
export function getBuildOutputPath(config: ProjectConfiguration): string {
  return config.targets?.build?.options?.outputPath ?? `dist/${config.root}`;
}
