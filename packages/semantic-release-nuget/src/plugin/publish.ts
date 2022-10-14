import { PluginFunction } from '@semantic-release/semantic-release';
import { exec as execCb } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import { NugetPluginConfig } from './config';

const exec = promisify(execCb);

export const publish: PluginFunction = async (
  config: NugetPluginConfig,
  context
) => {
  const { nupkgRoot, source, symbolSource, skipDuplicate, timeout } = config;
  const {
    cwd,
    env,
    // stdout,
    // stderr
  } = context;

  const basePath = nupkgRoot ? path.resolve(cwd, nupkgRoot) : cwd;

  const args = [
    'dotnet',
    'nuget',
    'push',
    '*.nupkg',
    source ? `--source ${source}` : null,
    env.NUGET_API_KEY ? `--api-key ${env.NUGET_API_KEY}` : null,
    symbolSource ? `--symbol-source ${symbolSource}` : null,
    env.NUGET_API_KEY ? `--symbol-api-key ${env.NUGET_API_KEY}` : null,
    skipDuplicate ? '--skip-duplicate' : null,
    timeout ? `--timeout ${timeout}` : null,
  ].filter((v) => !!v);

  const dotnetResult = await exec(args.join(' '), { env, cwd: basePath });

  // dotnetResult.stdout.pipe(stdout, { end: false });
  // dotnetResult.stderr.pipe(stderr, { end: false });

  await dotnetResult;

  return false;
};
