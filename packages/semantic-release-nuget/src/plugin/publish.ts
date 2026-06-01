import { PluginFunction } from '@semantic-release/semantic-release';
import { PublishContext } from 'semantic-release';
import { execFile as execFileCb } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import { NugetPluginConfig } from './config';

const execFile = promisify(execFileCb);

export const publish: PluginFunction<PublishContext> = async (
  config: NugetPluginConfig,
  context
) => {
  const { nupkgRoot, source, symbolSource, skipDuplicate, timeout } = config;
  const { cwd, env } = context;

  const basePath = nupkgRoot ? path.resolve(cwd, nupkgRoot) : cwd;

  const args: string[] = [
    'nuget',
    'push',
    '*.nupkg',
    ...(source ? ['--source', source] : []),
    ...(env.NUGET_API_KEY ? ['--api-key', env.NUGET_API_KEY] : []),
    ...(symbolSource ? ['--symbol-source', symbolSource] : []),
    ...(env.NUGET_API_KEY ? ['--symbol-api-key', env.NUGET_API_KEY] : []),
    ...(skipDuplicate ? ['--skip-duplicate'] : []),
    ...(timeout ? ['--timeout', String(timeout)] : []),
  ];

  await execFile('dotnet', args, { env, cwd: basePath });

  return false;
};
