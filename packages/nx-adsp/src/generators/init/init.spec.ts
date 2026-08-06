import { readJson, Tree, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator from './init';

describe('nx-adsp init generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('wires the ADSP SDK MCP server into the workspace .mcp.json, standalone', async () => {
    await generator(host);

    expect(host.exists('.mcp.json')).toBeTruthy();
    const mcp = readJson(host, '.mcp.json');
    expect(mcp.mcpServers['adsp-sdk']).toEqual({
      command: 'npx',
      args: ['-y', '@abgov/adsp-sdk-mcp-server'],
    });
  });

  it('merges .mcp.json without clobbering other servers or a customized entry', async () => {
    writeJson(host, '.mcp.json', {
      mcpServers: {
        other: { command: 'other-cmd', args: [] },
        'adsp-sdk': { command: 'node', args: ['/local/build/main.js'] },
      },
    });

    await generator(host);

    const mcp = readJson(host, '.mcp.json');
    expect(mcp.mcpServers.other).toEqual({ command: 'other-cmd', args: [] });
    expect(mcp.mcpServers['adsp-sdk']).toEqual({
      command: 'node',
      args: ['/local/build/main.js'],
    });
  });

  it('reminds that a session reconnect is needed before the MCP server is usable', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await generator(host);

    expect(logSpy.mock.calls.flat().join('\n')).toContain('reconnect');
    logSpy.mockRestore();
  });

  it('adds .env.local and .env.*.local to .gitignore', async () => {
    await generator(host);

    const gitignore = host.read('.gitignore').toString();
    expect(gitignore).toContain('.env.local');
    expect(gitignore).toContain('.env.*.local');
  });

  it('does not duplicate .env.local if it is already in .gitignore', async () => {
    host.write('.gitignore', '.env.local\n.env.*.local\n');

    await generator(host);

    const gitignore = host.read('.gitignore').toString();
    expect(gitignore.split('.env.local').length - 1).toBe(1);
  });

  it('appends .env.local to an existing .gitignore that does not have it', async () => {
    host.write('.gitignore', 'node_modules\ndist\n');

    await generator(host);

    const gitignore = host.read('.gitignore').toString();
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('.env.local');
  });

  it('writes shared VS Code settings, standalone', async () => {
    await generator(host);

    expect(host.exists('.vscode/settings.json')).toBeTruthy();
    const settings = readJson(host, '.vscode/settings.json');
    expect(settings['editor.formatOnSave']).toBe(true);
    expect(settings['editor.defaultFormatter']).toBe('esbenp.prettier-vscode');
  });

  it('merges into existing VS Code settings without dropping unrelated ones', async () => {
    writeJson(host, '.vscode/settings.json', {
      'files.exclude': { '**/.git': true },
    });

    await generator(host);

    const settings = readJson(host, '.vscode/settings.json');
    expect(settings['files.exclude']).toEqual({ '**/.git': true });
    expect(settings['editor.formatOnSave']).toBe(true);
  });
});
