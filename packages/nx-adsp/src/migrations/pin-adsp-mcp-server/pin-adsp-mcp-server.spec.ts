import { readJson, Tree, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import migration from './pin-adsp-mcp-server';

const PACKAGE = '@abgov/adsp-sdk-mcp-server';

describe('pin-adsp-mcp-server migration', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  function writeMcpJson(entry: unknown, others: Record<string, unknown> = {}) {
    writeJson(tree, '.mcp.json', {
      mcpServers: { ...others, 'adsp-sdk': entry },
    });
  }

  it('rewrites the fetching entry to the pinned form and adds the dev dependency', async () => {
    writeMcpJson({ command: 'npx', args: ['-y', PACKAGE] });

    await migration(tree);

    expect(readJson(tree, '.mcp.json').mcpServers['adsp-sdk']).toEqual({
      command: 'npx',
      args: ['--no', PACKAGE],
    });
    expect(
      readJson(tree, 'package.json').devDependencies[PACKAGE],
    ).toBeDefined();
  });

  it('leaves other MCP servers alone', async () => {
    writeMcpJson(
      { command: 'npx', args: ['-y', PACKAGE] },
      { other: { command: 'other-cmd', args: ['-y', 'something'] } },
    );

    await migration(tree);

    expect(readJson(tree, '.mcp.json').mcpServers.other).toEqual({
      command: 'other-cmd',
      args: ['-y', 'something'],
    });
  });

  it('is idempotent, and backfills the dependency for an already-pinned entry', async () => {
    writeMcpJson({ command: 'npx', args: ['--no', PACKAGE] });

    await migration(tree);

    expect(readJson(tree, '.mcp.json').mcpServers['adsp-sdk']).toEqual({
      command: 'npx',
      args: ['--no', PACKAGE],
    });
    expect(
      readJson(tree, 'package.json').devDependencies[PACKAGE],
    ).toBeDefined();
  });

  it('does not bump a version the workspace already chose', async () => {
    writeJson(tree, 'package.json', {
      name: 'test-workspace',
      devDependencies: { [PACKAGE]: '1.11.0' },
    });
    writeMcpJson({ command: 'npx', args: ['-y', PACKAGE] });

    await migration(tree);

    expect(readJson(tree, 'package.json').devDependencies[PACKAGE]).toBe(
      '1.11.0',
    );
  });

  it('warns and skips a customised entry rather than rewriting it', async () => {
    const custom = { command: 'node', args: ['/local/build/main.js'] };
    writeMcpJson(custom);

    const report = await migration(tree);

    expect(readJson(tree, '.mcp.json').mcpServers['adsp-sdk']).toEqual(custom);
    expect(
      readJson(tree, 'package.json').devDependencies?.[PACKAGE],
    ).toBeUndefined();
    expect(report?.nextSteps.join('\n')).toContain('.mcp.json');
    expect(report?.agentContext?.join('\n')).toContain('customised');
  });

  it('skips an entry that pins a version in args, since that is not the generated form', async () => {
    const pinnedInArgs = { command: 'npx', args: ['-y', `${PACKAGE}@1.11.0`] };
    writeMcpJson(pinnedInArgs);

    const report = await migration(tree);

    expect(readJson(tree, '.mcp.json').mcpServers['adsp-sdk']).toEqual(
      pinnedInArgs,
    );
    expect(report?.nextSteps).toHaveLength(1);
  });

  it('does nothing when the workspace has no .mcp.json', async () => {
    const report = await migration(tree);

    expect(report).toBeUndefined();
    expect(
      readJson(tree, 'package.json').devDependencies?.[PACKAGE],
    ).toBeUndefined();
  });

  it('does nothing when .mcp.json has no adsp-sdk server', async () => {
    writeJson(tree, '.mcp.json', {
      mcpServers: { other: { command: 'other-cmd', args: [] } },
    });

    const report = await migration(tree);

    expect(report).toBeUndefined();
    expect(
      readJson(tree, 'package.json').devDependencies?.[PACKAGE],
    ).toBeUndefined();
  });

  it('warns and leaves an unparseable .mcp.json untouched', async () => {
    tree.write('.mcp.json', '{ not json');
    const warn = jest.spyOn(console, 'warn').mockImplementation();

    const report = await migration(tree);

    expect(report).toBeUndefined();
    expect(tree.read('.mcp.json', 'utf-8')).toBe('{ not json');
    warn.mockRestore();
  });
});
