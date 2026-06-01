import { PublishContext } from 'semantic-release';
import { execFile as execFileCb } from 'child_process';
import { readdirSync } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { NugetPluginConfig } from './config';

const execFile = promisify(execFileCb);

export async function publish(config: NugetPluginConfig, context: PublishContext): Promise<void> {
  const { nupkgRoot, source, symbolSource, skipDuplicate, timeout } = config;
  const { cwd, env, logger } = context;

  const basePath = nupkgRoot ? path.resolve(cwd, nupkgRoot) : cwd;
  const nupkgFiles = readdirSync(basePath).filter((f) => f.endsWith('.nupkg'));

  if (nupkgFiles.length === 0) {
    throw new Error(`No .nupkg files found in ${basePath}`);
  }

  for (const nupkg of nupkgFiles) {
    logger.log('Pushing %s', nupkg);
    const args: string[] = [
      'nuget',
      'push',
      nupkg,
      ...(source ? ['--source', source] : []),
      ...(env.NUGET_API_KEY ? ['--api-key', env.NUGET_API_KEY] : []),
      ...(symbolSource ? ['--symbol-source', symbolSource] : []),
      ...(env.NUGET_API_KEY ? ['--symbol-api-key', env.NUGET_API_KEY] : []),
      ...(skipDuplicate ? ['--skip-duplicate'] : []),
      ...(timeout ? ['--timeout', String(timeout)] : []),
    ];
    await execFile('dotnet', args, { env, cwd: basePath });
  }
}
