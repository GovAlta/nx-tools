import { PluginFunction } from '@semantic-release/semantic-release';
import * as execa from 'execa';
import { NugetPluginConfig } from './config';

export const prepare: PluginFunction = async (
  config: NugetPluginConfig,
  context
) => {
  const { configuration, noBuild, includeSymbols, includeSource, serviceable } =
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
    noBuild ? '--no-build' : null,
    includeSymbols ? '--include-symbols' : null,
    includeSource ? '--include-source' : null,
    serviceable ? '----serviceable' : null,
    !noBuild ? `--configuration ${configuration || 'Release'}` : null,
    `/p:Version=${version}`,
  ].filter((v) => !!v);

  const dotnetResult = execa('dotnet', args, { env, cwd });

  dotnetResult.stdout.pipe(stdout, { end: false });
  dotnetResult.stderr.pipe(stderr, { end: false });

  await dotnetResult;
};
