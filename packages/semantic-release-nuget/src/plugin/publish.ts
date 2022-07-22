import { PluginFunction } from '@semantic-release/semantic-release';
import * as execa from 'execa';
import path = require('path');
import { NugetPluginConfig } from './config';

export const publish: PluginFunction = async (
  config: NugetPluginConfig,
  context
) => {
  const {
    nupkgRoot,
    source,
    apiKey,
    symbolSource,
    symbolApiKey,
    skipDuplicate,
    timeout,
  } = config;
  const { cwd, env, stdout, stderr } = context;

  const basePath = nupkgRoot ? path.resolve(cwd, nupkgRoot) : cwd;

  const args = [
    'nuget',
    'push',
    '*.nupkg',
    source ? `--source ${source}` : null,
    apiKey ? `--api-key ${apiKey}` : null,
    symbolSource ? `--symbol-source ${symbolSource}` : null,
    symbolApiKey ? `--symbol-api-key ${symbolApiKey}` : null,
    skipDuplicate ? '--skip-duplicate' : null,
    timeout ? `--timeout ${timeout}` : null,
  ].filter((v) => !!v);

  const dotnetResult = execa('dotnet', args, { env, cwd: basePath });

  dotnetResult.stdout.pipe(stdout, { end: false });
  dotnetResult.stderr.pipe(stderr, { end: false });

  await dotnetResult;

  return false;
};
