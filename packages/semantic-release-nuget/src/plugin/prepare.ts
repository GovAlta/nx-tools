import { PrepareContext } from 'semantic-release';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { NugetPluginConfig } from './config';

const execFile = promisify(execFileCb);

export async function prepare(config: NugetPluginConfig, context: PrepareContext): Promise<void> {
  const { project, configuration, noBuild, includeSymbols, includeSource, serviceable } = config;
  const {
    cwd,
    env,
    logger,
    nextRelease: { version },
  } = context;

  const projects = Array.isArray(project) ? project : [project].filter(Boolean) as string[];

  for (const proj of projects) {
    logger.log('Packing %s at version %s', proj, version);
    const args: string[] = [
      'pack',
      proj,
      ...(noBuild ? ['--no-build'] : []),
      ...(includeSymbols ? ['--include-symbols'] : []),
      ...(includeSource ? ['--include-source'] : []),
      ...(serviceable ? ['--serviceable'] : []),
      `/p:Configuration=${configuration || 'Release'}`,
      `/p:Version=${version}`,
    ];
    await execFile('dotnet', args, { env, cwd });
  }
}
