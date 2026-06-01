import { PluginFunction } from '@semantic-release/semantic-release';
import { PrepareContext } from 'semantic-release';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { NugetPluginConfig } from './config';

const execFile = promisify(execFileCb);

export const prepare: PluginFunction<PrepareContext> = async (
  config: NugetPluginConfig,
  context
) => {
  const { project, configuration, noBuild, includeSymbols, includeSource, serviceable } = config;
  const {
    cwd,
    env,
    nextRelease: { version },
  } = context;

  const args: string[] = [
    'pack',
    project,
    ...(noBuild ? ['--no-build'] : []),
    ...(includeSymbols ? ['--include-symbols'] : []),
    ...(includeSource ? ['--include-source'] : []),
    ...(serviceable ? ['--serviceable'] : []),
    `/p:Configuration=${configuration || 'Release'}`,
    `/p:Version=${version}`,
  ];

  await execFile('dotnet', args, { env, cwd });
};
