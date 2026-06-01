import { PluginFunction } from '@semantic-release/semantic-release';
import { PublishContext } from 'semantic-release';
import { execFile as execFileCb } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { NugetPluginConfig } from './config';

const execFile = promisify(execFileCb);

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const publish: PluginFunction<PublishContext> = async (
  config: NugetPluginConfig,
  context
) => {
  const { nupkgRoot, source, symbolSource, skipDuplicate, timeout } = config;
  const { cwd, env } = context;

  const basePath = nupkgRoot ? path.resolve(cwd, nupkgRoot) : cwd;

  let tempDir: string | null = null;

  try {
    let configArgs: string[] = [];

    if (env.NUGET_API_KEY) {
      tempDir = mkdtempSync(path.join(tmpdir(), 'sr-nuget-'));
      const configPath = path.join(tempDir, 'nuget.config');
      const targetSource = source || 'https://api.nuget.org/v3/index.json';
      const apiKeyLines = [
        `    <add key="${escapeXml(targetSource)}" value="${escapeXml(env.NUGET_API_KEY)}" />`,
        ...(symbolSource
          ? [
              `    <add key="${escapeXml(symbolSource)}" value="${escapeXml(env.NUGET_API_KEY)}" />`,
            ]
          : []),
      ].join('\n');
      writeFileSync(
        configPath,
        `<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n  <apikeys>\n${apiKeyLines}\n  </apikeys>\n</configuration>`,
      );
      configArgs = ['--config-file', configPath];
    }

    const args: string[] = [
      'nuget',
      'push',
      '*.nupkg',
      ...(source ? ['--source', source] : []),
      ...(symbolSource ? ['--symbol-source', symbolSource] : []),
      ...configArgs,
      ...(skipDuplicate ? ['--skip-duplicate'] : []),
      ...(timeout ? ['--timeout', String(timeout)] : []),
    ];

    await execFile('dotnet', args, { env, cwd: basePath });
  } finally {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  return false;
};
