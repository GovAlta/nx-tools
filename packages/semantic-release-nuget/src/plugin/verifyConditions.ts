import { PrepareContext } from 'semantic-release';
import { NugetPluginConfig } from './config';

export async function verifyConditions(
  config: NugetPluginConfig,
  context: PrepareContext,
): Promise<void> {
  const { logger, env } = context;

  const projects = Array.isArray(config.project) ? config.project : [config.project];
  if (projects.length === 0 || projects.some((p) => !p)) {
    throw new Error(
      'semantic-release-nuget: "project" must be set to a .csproj path or array of paths',
    );
  }

  if (!env.NUGET_API_KEY) {
    logger.warn(
      'semantic-release-nuget: NUGET_API_KEY is not set — dotnet will use credentials from nuget.config',
    );
  }

  logger.log('semantic-release-nuget: configuration verified');
}
