import { PluginFunction } from '@semantic-release/semantic-release';
import * as execa from 'execa';
import { NugetPluginConfig } from './config';

export const prepare: PluginFunction = async (
  config: NugetPluginConfig,
  context
) => {
  const { project, configuration, noBuild, includeSymbols, includeSource, serviceable } =
    config;

  const {
    cwd,
    env,
    stdout,
    stderr,
    nextRelease: { version },
  } = context;

  const args = [
    'pack',
    project,
    noBuild ? '--no-build' : null,
    includeSymbols ? '--include-symbols' : null,
    includeSource ? '--include-source' : null,
    serviceable ? '----serviceable' : null,
    `/p:Configuration ${configuration || 'Release'}`,
    `/p:Version=${version}`,
  ].filter((v) => !!v);

  const dotnetResult = execa('dotnet', args, { env, cwd });

  dotnetResult.stdout.pipe(stdout, { end: false });
  dotnetResult.stderr.pipe(stderr, { end: false });

  await dotnetResult;
};
