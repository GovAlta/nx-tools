import { PluginFunction } from '@semantic-release/semantic-release';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { NugetPluginConfig } from './config';

const exec = promisify(execCb);

export const prepare: PluginFunction = async (
  config: NugetPluginConfig,
  context
) => {
  const { project, configuration, noBuild, includeSymbols, includeSource, serviceable } =
    config;

  const {
    cwd,
    env,
    // stdout,
    // stderr,
    nextRelease: { version },
  } = context;

  const args = [
    'dotnet',
    'pack',
    project,
    noBuild ? '--no-build' : null,
    includeSymbols ? '--include-symbols' : null,
    includeSource ? '--include-source' : null,
    serviceable ? '--serviceable' : null,
    `/p:Configuration=${configuration || 'Release'}`,
    `/p:Version=${version}`,
  ].filter((v) => !!v);

  const dotnetResult = await exec(args.join(' '), { env, cwd });

  // dotnetResult.stdout.pipe(stdout, { end: false });
  // dotnetResult.stderr.pipe(stderr, { end: false });

  await dotnetResult;
};
