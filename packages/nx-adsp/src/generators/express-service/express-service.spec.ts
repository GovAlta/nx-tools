import { readJson, readProjectConfiguration, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import * as utils from '@abgov/nx-oc';
import { environments } from '@abgov/nx-oc';
import { Schema } from './schema';
import generator from './express-service';

jest.mock('@abgov/nx-oc');
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});
utilsMock.deploymentGenerator.mockResolvedValue(undefined);
utilsMock.ensureAdspToken.mockResolvedValue('test-token');

describe('Express Service Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/src/main.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/environment.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/environments/environment.ts')).toBeFalsy();
  }, 60000);

  it('wires the ADSP SDK MCP server into the workspace .mcp.json', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    expect(host.exists('.mcp.json')).toBeTruthy();
    const mcp = readJson(host, '.mcp.json');
    expect(mcp.mcpServers['adsp-sdk']).toEqual({
      command: 'npx',
      args: ['-y', '@abgov/adsp-sdk-mcp-server'],
    });
    // Agents are pointed at the tools, not left to guess the SDK.
    const agents = host.read('apps/test/AGENTS.md').toString();
    expect(agents).toContain('@abgov/adsp-sdk-mcp-server');
    expect(agents).toContain('get_platform_quickstart');
    expect(agents).toContain('search_sdk_reference');
  }, 60000);

  it('merges .mcp.json without clobbering other servers or a customized entry', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    writeJson(host, '.mcp.json', {
      mcpServers: {
        other: { command: 'other-cmd', args: [] },
        'adsp-sdk': { command: 'node', args: ['/local/build/main.js'] },
      },
    });
    await generator(host, options);

    const mcp = readJson(host, '.mcp.json');
    // Unrelated server preserved.
    expect(mcp.mcpServers.other).toEqual({ command: 'other-cmd', args: [] });
    // A team's customized adsp-sdk entry is not overwritten.
    expect(mcp.mcpServers['adsp-sdk']).toEqual({ command: 'node', args: ['/local/build/main.js'] });
  }, 60000);

  it('factors routes into a router module mounted in main.ts (not inlined)', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    // main.ts holds infra + the mount, not route handlers.
    const mainTs = host.read('apps/test/src/main.ts').toString();
    expect(mainTs).toContain('createErrorHandler');
    expect(mainTs).toContain("import { exampleRouter } from './routes/example'");
    expect(mainTs).toContain('exampleRouter(eventService)');
    // The handler internals moved out of main.ts.
    expect(mainTs).not.toContain('authorize');
    expect(mainTs).not.toContain('/v1/example');

    // The router module carries the handlers, capabilities passed in as args.
    expect(host.exists('apps/test/src/routes/example.ts')).toBeTruthy();
    const routerTs = host.read('apps/test/src/routes/example.ts').toString();
    expect(routerTs).toContain('export function exampleRouter(eventService: EventService)');
    expect(routerTs).toContain('authorize');
    expect(routerTs).toContain('createValidationHandler');
    expect(routerTs).toContain('eventService.send');

    // Shipped with a supertest test demonstrating the router-testing pattern.
    expect(host.exists('apps/test/src/routes/example.spec.ts')).toBeTruthy();
  }, 60000);

  it('scaffolds postgres database files and targets', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, { ...options, database: 'postgres' });

    expect(host.exists('apps/test/src/db/schema.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/database.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/migrate.ts')).toBeTruthy();
    expect(host.exists('apps/test/drizzle.config.ts')).toBeTruthy();
    expect(host.exists('apps/test/scripts/dev-db.sh')).toBeTruthy();
    expect(host.exists('apps/test/.env.example')).toBeTruthy();

    const database = host.read('apps/test/src/database.ts').toString();
    expect(database).toContain('drizzle-orm/node-postgres');
    expect(database).toContain('closeDatabase');

    // webpack emits a second bundle (migrate.js) for the deploy init container.
    const webpackConfig = host.read('apps/test/webpack.config.js').toString();
    expect(webpackConfig).toContain('migrate');

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['dev-db']).toBeTruthy();
    expect(config.targets['db:generate']).toBeTruthy();
    expect(config.targets['db:migrate']).toBeTruthy();
    expect(config.targets['db:migrate:deploy']).toBeTruthy();
    expect(config.targets['db:studio']).toBeTruthy();
    expect(config.targets['serve'].dependsOn).toContain('dev-db');

    // Drizzle has no client codegen, so build must NOT depend on db:generate.
    expect(config.targets['build'].dependsOn ?? []).not.toContain('db:generate');
    // The SQL migrations are shipped as a build asset.
    const assets = config.targets['build'].options.assets ?? [];
    expect(
      assets.some(
        (a: unknown) =>
          typeof a === 'object' && (a as { output?: string }).output === 'drizzle'
      )
    ).toBe(true);

    // Tagged so the sandbox generator wires the DB without a --database flag.
    expect(config.tags).toContain('adsp:database:postgres');
  }, 60000);

  it('scaffolds mongo database files and targets', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, { ...options, database: 'mongo' });

    expect(host.exists('apps/test/src/database.ts')).toBeTruthy();
    expect(host.exists('apps/test/scripts/dev-db.sh')).toBeTruthy();
    expect(host.exists('apps/test/.env.example')).toBeTruthy();

    const database = host.read('apps/test/src/database.ts').toString();
    expect(database).toContain('mongoose');

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['dev-db']).toBeTruthy();
    expect(config.targets['serve'].dependsOn).toContain('dev-db');
    expect(config.targets['db:generate']).toBeFalsy();
    expect(config.tags).toContain('adsp:database:mongo');
  }, 60000);

  it('does not scaffold database files when database is none', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, { ...options, database: 'none' });

    expect(host.exists('apps/test/src/db/schema.ts')).toBeFalsy();
    expect(host.exists('apps/test/src/database.ts')).toBeFalsy();
    expect(host.exists('apps/test/scripts/dev-db.sh')).toBeFalsy();

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['dev-db']).toBeFalsy();
    expect((config.tags ?? []).some((t) => t.startsWith('adsp:database:'))).toBe(
      false
    );
  }, 60000);
});
