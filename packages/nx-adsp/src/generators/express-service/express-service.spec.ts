import {
  addProjectConfiguration,
  readJson,
  readProjectConfiguration,
  writeJson,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import * as utils from '@abgov/nx-oc';
import { environments } from '@abgov/nx-oc';
import * as keycloakAdmin from '../../utils/keycloak-admin';
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
// jest.mock('@abgov/nx-oc') automocks adspProjectTags too — restore the real
// (pure, no I/O) implementation so tag-writing behavior is actually exercised.
utilsMock.adspProjectTags.mockImplementation(
  jest.requireActual('@abgov/nx-oc').adspProjectTags,
);
utilsMock.deploymentGenerator.mockResolvedValue(undefined);
utilsMock.ensureAdspToken.mockResolvedValue('test-token');

jest.mock('../../utils/keycloak-admin');
const keycloakAdminMock = keycloakAdmin as jest.Mocked<typeof keycloakAdmin>;

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
    expect(
      host.exists('apps/test/src/environments/environment.ts'),
    ).toBeFalsy();
  }, 60000);

  it('serves generated OpenAPI docs, discoverable via the root _links convention', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    // Shared registry module: extends Zod once, exports the registry every
    // router registers its paths into.
    expect(host.exists('apps/test/src/openapi.ts')).toBeTruthy();
    const openapiTs = host.read('apps/test/src/openapi.ts').toString();
    expect(openapiTs).toContain('extendZodWithOpenApi');
    expect(openapiTs).toContain('export const registry');

    // main.ts builds the doc from the registry once at startup and serves it
    // at the conventional path; the root endpoint's _links gains a docs entry
    // pointing at it — this is what ADSP's directory service polls for.
    const mainTs = host.read('apps/test/src/main.ts').toString();
    expect(mainTs).toContain('OpenApiGeneratorV3');
    expect(mainTs).toContain('/swagger/docs/v1');
    expect(mainTs).toContain(
      "docs: { href: new URL('/swagger/docs/v1', rootUrl).href }",
    );
    // Document-level default security — without it, routes with no explicit
    // `security` override (e.g. /private) would inherit nothing at all,
    // rather than the accessToken requirement they actually enforce.
    expect(mainTs).toContain('security: [{ accessToken: [] }]');

    // The shipped example router documents its own routes, reusing the same
    // schema already passed to createValidationHandler (no separate spec).
    const routerTs = host.read('apps/test/src/routes/example.ts').toString();
    expect(routerTs).toContain('registry.registerPath');
    expect(routerTs).toContain("import { registry } from '../openapi'");

    // Runtime dependency (built at app startup), not a devDependency.
    const pkgJson = readJson(host, 'package.json');
    expect(pkgJson.dependencies['@asteasolutions/zod-to-openapi']).toBeTruthy();
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
    expect(agents).toContain('get_service_configuration_schema');
    expect(agents).toContain('search_sdk_reference');
  }, 60000);

  it('scaffolds a Jest e2e project with the port default fixed to match environment.ts', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    const e2eRoot = 'apps/test-e2e';
    expect(host.exists(`${e2eRoot}/jest.config.cts`)).toBeTruthy();

    // @nx/node:e2e-project's own template hardcodes a fallback port of 3000;
    // nx-adsp's own environment.ts.__tmpl__ defaults PORT to 3333. Which of
    // @nx/node's two jest.config.cts shapes (ts-jest vs. @swc/jest — see
    // fixExpressServiceE2eProject's own tests for that variance) this
    // workspace produces isn't deterministic here, but the port fix applies
    // to both identically.
    for (const file of ['global-setup.ts', 'global-teardown.ts']) {
      const content = host.read(`${e2eRoot}/src/support/${file}`).toString();
      expect(content).not.toContain(': 3000');
      expect(content).toContain(': 3333');
    }
    const testSetup = host
      .read(`${e2eRoot}/src/support/test-setup.ts`)
      .toString();
    expect(testSetup).not.toContain("?? '3000'");
    expect(testSetup).toContain("?? '3333'");
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
    expect(mcp.mcpServers['adsp-sdk']).toEqual({
      command: 'node',
      args: ['/local/build/main.js'],
    });
  }, 60000);

  it('factors routes into a router module mounted in main.ts (not inlined)', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    // main.ts holds infra + the mount, not route handlers.
    const mainTs = host.read('apps/test/src/main.ts').toString();
    expect(mainTs).toContain('createErrorHandler');
    expect(mainTs).toContain(
      "import { exampleRouter } from './routes/example'",
    );
    expect(mainTs).toContain('exampleRouter(eventService)');
    // The handler internals moved out of main.ts.
    expect(mainTs).not.toContain('authorize');
    expect(mainTs).not.toContain('/v1/example');

    // The router module carries the handlers, capabilities passed in as args.
    expect(host.exists('apps/test/src/routes/example.ts')).toBeTruthy();
    const routerTs = host.read('apps/test/src/routes/example.ts').toString();
    expect(routerTs).toContain(
      'export function exampleRouter(eventService: EventService)',
    );
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
    const migrateTs = host.read('apps/test/src/migrate.ts').toString();
    // Guards against concurrent replicas racing drizzle-orm's migrate(), which has
    // no built-in protection (drizzle-team/drizzle-orm#874).
    expect(migrateTs).toContain('pg_advisory_lock');
    expect(migrateTs).toContain('pg_advisory_unlock');
    expect(host.exists('apps/test/drizzle.config.ts')).toBeTruthy();
    expect(host.exists('apps/test/scripts/dev-db.sh')).toBeTruthy();
    expect(host.exists('apps/test/.env.example')).toBeTruthy();

    const database = host.read('apps/test/src/database.ts').toString();
    expect(database).toContain('drizzle-orm/node-postgres');
    expect(database).toContain('closeDatabase');
    expect(database).toContain('isDatabaseReady');

    // Readiness (DB-checked) is wired up separately from liveness — a DB
    // outage should hold traffic, not restart a pod that can't fix it.
    const mainTs = host.read('apps/test/src/main.ts').toString();
    expect(mainTs).toContain('isDatabaseReady');
    expect(mainTs).toContain("app.get('/health/ready'");

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
    expect(config.targets['build'].dependsOn ?? []).not.toContain(
      'db:generate',
    );
    // The SQL migrations are shipped as a build asset.
    const assets = config.targets['build'].options.assets ?? [];
    expect(
      assets.some(
        (a: unknown) =>
          typeof a === 'object' &&
          (a as { output?: string }).output === 'drizzle',
      ),
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
    expect(database).toContain('isDatabaseReady');

    const mainTs = host.read('apps/test/src/main.ts').toString();
    expect(mainTs).toContain('isDatabaseReady');
    expect(mainTs).toContain("app.get('/health/ready'");

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

    // No database to check readiness against — don't emit a route that
    // would always report ready regardless of anything real.
    const mainTs = host.read('apps/test/src/main.ts').toString();
    expect(mainTs).not.toContain('/health/ready');
    expect(mainTs).not.toContain('isDatabaseReady');

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['dev-db']).toBeFalsy();
    expect(
      (config.tags ?? []).some((t) => t.startsWith('adsp:database:')),
    ).toBe(false);
  }, 60000);

  it('writes a provisioned CLIENT_SECRET to .env.local, not .env', async () => {
    keycloakAdminMock.ensureServiceClient.mockResolvedValueOnce('super-secret');
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, { ...options, accessToken: 'test-token' });

    expect(host.read('apps/test/.env.local').toString()).toContain(
      'CLIENT_SECRET=super-secret',
    );
    expect(host.exists('apps/test/.env')).toBeFalsy();
  }, 60000);

  it('ensures .env.local is gitignored when writing the provisioned secret', async () => {
    keycloakAdminMock.ensureServiceClient.mockResolvedValueOnce('super-secret');
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, { ...options, accessToken: 'test-token' });

    const gitignore = host.read('.gitignore')?.toString() ?? '';
    expect(gitignore).toContain('.env.local');
    expect(gitignore).toContain('.env.*.local');
  }, 60000);

  it('does not overwrite or duplicate an existing CLIENT_SECRET in .env.local', async () => {
    keycloakAdminMock.ensureServiceClient.mockResolvedValueOnce(
      'freshly-provisioned-secret',
    );
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    // express-service is a one-shot scaffolder (re-running it against an
    // existing project throws in @nx/express), so this exercises the guard
    // directly rather than by calling the generator twice: a CLIENT_SECRET
    // already present in .env.local (e.g. set by hand) must survive untouched.
    host.write('apps/test/.env.local', 'CLIENT_SECRET=already-there\n');
    await generator(host, { ...options, accessToken: 'test-token' });

    const envLocal = host.read('apps/test/.env.local').toString();
    expect(envLocal).toContain('CLIENT_SECRET=already-there');
    expect(envLocal).not.toContain('freshly-provisioned-secret');
    expect(envLocal.split('CLIENT_SECRET=').length - 1).toBe(1);
  }, 60000);

  it('preserves an existing .env.local value (e.g. a prior dev-db run) alongside CLIENT_SECRET', async () => {
    keycloakAdminMock.ensureServiceClient.mockResolvedValueOnce('super-secret');
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    host.write(
      'apps/test/.env.local',
      'DATABASE_URL=postgresql://test:test@localhost:5432/test_dev\n',
    );
    await generator(host, { ...options, accessToken: 'test-token' });

    const envLocal = host.read('apps/test/.env.local').toString();
    expect(envLocal).toContain(
      'DATABASE_URL=postgresql://test:test@localhost:5432/test_dev',
    );
    expect(envLocal).toContain('CLIENT_SECRET=super-secret');
  }, 60000);

  it('writes nothing when no secret is provisioned', async () => {
    keycloakAdminMock.ensureServiceClient.mockResolvedValueOnce(null);
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, { ...options, accessToken: 'test-token' });

    expect(host.exists('apps/test/.env.local')).toBeFalsy();
    expect(host.exists('apps/test/.env')).toBeFalsy();
  }, 60000);

  it('derives the sandbox tag from --pairedProject and adds it to the project', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addProjectConfiguration(host, 'test-app', { root: 'apps/test-app' });
    await generator(host, { ...options, pairedProject: 'test-app' });

    const config = readProjectConfiguration(host, 'test');
    expect(config.tags).toContain('adsp:paired-frontend:test-app:4200');
  }, 60000);

  it('surfaces the paired project name in AGENTS.md', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addProjectConfiguration(host, 'test-app', { root: 'apps/test-app' });
    await generator(host, { ...options, pairedProject: 'test-app' });

    const agents = host.read('apps/test/AGENTS.md').toString();
    expect(agents).toContain('test-app');
  }, 60000);

  describe('--pairedProject proxy wiring', () => {
    // Simplified nginx.conf matching the template structure (no proxy entries yet).
    const NGINX_CONF_NO_PROXY = `events {
  worker_connections 1024;
}

http {
  server {
    listen 8080;

    location / {
      try_files $uri /index.html;
    }

  }
}
`;

    it('writes vite.proxy.cjs and patches serve target and nginx.conf for a Vue frontend', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      addProjectConfiguration(host, 'my-vue-app', {
        root: 'apps/my-vue-app',
        projectType: 'application',
        targets: {
          serve: { executor: '@nx/vite:dev-server', options: { port: 4200 } },
          build: {
            executor: '@nx/vite:build',
            options: { outputPath: 'dist/apps/my-vue-app' },
          },
        },
        tags: ['adsp:scaffold-env:dev'],
      });
      host.write('apps/my-vue-app/public/nginx.conf', NGINX_CONF_NO_PROXY);

      await generator(host, { ...options, pairedProject: 'my-vue-app' });

      // Dev proxy module written at the Vue location -- a .cjs module, because
      // Vite rewrites with a function and ignores JSON's `pathRewrite`.
      expect(host.exists('apps/my-vue-app/vite.proxy.cjs')).toBeTruthy();
      const source = host.read('apps/my-vue-app/vite.proxy.cjs').toString();
      const proxyModule = { exports: {} };
      new Function('module', 'exports', source)(
        proxyModule,
        proxyModule.exports,
      );
      const proxyConf = proxyModule.exports as Record<
        string,
        { target: string; rewrite: (path: string) => string }
      >;
      expect(proxyConf['/api/']).toBeDefined();
      expect(proxyConf['/api/'].target).toBe('http://localhost:3333');
      expect(proxyConf['/api/'].rewrite('/api/v1/things')).toBe(
        '/test/v1/things',
      );

      // serve target updated with proxyConfig.
      const frontendConfig = readProjectConfiguration(host, 'my-vue-app');
      expect(frontendConfig.targets.serve.options.proxyConfig).toBe(
        'apps/my-vue-app/vite.proxy.cjs',
      );

      // nginx.conf updated with the proxy block.
      const nginx = host.read('apps/my-vue-app/public/nginx.conf').toString();
      expect(nginx).toContain('location /api/');
      expect(nginx).toContain('proxy_pass http://test:3333/test/');

      // Frontend tagged for the sandbox executor.
      expect(frontendConfig.tags).toContain('adsp:proxy-service:test:3333');
    }, 120000);

    it('writes proxy.conf.json, patches serve target, adds nginx asset, and updates nginx.conf for a React frontend', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      addProjectConfiguration(host, 'my-react-app', {
        root: 'apps/my-react-app',
        projectType: 'application',
        targets: {
          serve: {
            executor: '@nx/webpack:dev-server',
            options: { port: 4200 },
          },
          build: {
            executor: '@nx/webpack:webpack',
            options: { outputPath: 'dist/apps/my-react-app', assets: [] },
          },
        },
        tags: ['adsp:scaffold-env:dev'],
      });
      host.write('apps/my-react-app/nginx.conf', NGINX_CONF_NO_PROXY);

      await generator(host, { ...options, pairedProject: 'my-react-app' });

      // Dev proxy file written at the React location.
      expect(host.exists('apps/my-react-app/proxy.conf.json')).toBeTruthy();
      const proxyConf = readJson(host, 'apps/my-react-app/proxy.conf.json');
      expect(proxyConf['/api/'].target).toBe('http://localhost:3333');

      // serve target updated.
      const frontendConfig = readProjectConfiguration(host, 'my-react-app');
      expect(frontendConfig.targets.serve.options.proxyConfig).toBe(
        'apps/my-react-app/proxy.conf.json',
      );

      // nginx.conf at project root updated.
      const nginx = host.read('apps/my-react-app/nginx.conf').toString();
      expect(nginx).toContain('location /api/');

      // nginx.conf added as a webpack build asset.
      const assets = frontendConfig.targets.build.options.assets ?? [];
      expect(
        assets.some(
          (a: unknown) =>
            typeof a === 'object' &&
            (a as { glob?: string }).glob === 'nginx.conf' &&
            (a as { input?: string }).input === 'apps/my-react-app',
        ),
      ).toBe(true);

      // Frontend tagged.
      expect(frontendConfig.tags).toContain('adsp:proxy-service:test:3333');
    }, 120000);

    it('writes proxy.conf.json, patches serve target, adds nginx asset, and updates nginx.conf for an Angular frontend', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      addProjectConfiguration(host, 'my-angular-app', {
        root: 'apps/my-angular-app',
        projectType: 'application',
        targets: {
          serve: {
            executor: '@angular-devkit/build-angular:dev-server',
            options: { port: 4200 },
          },
          build: {
            executor: '@angular-devkit/build-angular:browser',
            options: {
              outputPath: 'dist/apps/my-angular-app',
              assets: [`apps/my-angular-app/src/silent-check-sso.html`],
            },
          },
        },
        tags: ['adsp:scaffold-env:dev'],
      });
      host.write('apps/my-angular-app/nginx.conf', NGINX_CONF_NO_PROXY);

      await generator(host, { ...options, pairedProject: 'my-angular-app' });

      // Dev proxy file written at the root (same path Angular generators use).
      expect(host.exists('apps/my-angular-app/proxy.conf.json')).toBeTruthy();
      const proxyConf = readJson(host, 'apps/my-angular-app/proxy.conf.json');
      expect(proxyConf['/api/'].target).toBe('http://localhost:3333');

      // serve target updated.
      const frontendConfig = readProjectConfiguration(host, 'my-angular-app');
      expect(frontendConfig.targets.serve.options.proxyConfig).toBe(
        'apps/my-angular-app/proxy.conf.json',
      );

      // nginx.conf at project root updated.
      const nginx = host.read('apps/my-angular-app/nginx.conf').toString();
      expect(nginx).toContain('location /api/');

      // nginx.conf added as a build asset.
      const assets = frontendConfig.targets.build.options.assets ?? [];
      expect(
        assets.some(
          (a: unknown) =>
            typeof a === 'object' &&
            (a as { glob?: string }).glob === 'nginx.conf',
        ),
      ).toBe(true);

      // Frontend tagged.
      expect(frontendConfig.tags).toContain('adsp:proxy-service:test:3333');
    }, 120000);

    it('does not crash when the frontend does not exist yet (composite generator ordering)', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      // No frontend project in the tree — composite generators scaffold
      // express-service before the frontend.
      await expect(
        generator(host, { ...options, pairedProject: 'not-yet-scaffolded' }),
      ).resolves.toBeDefined();
    }, 120000);
  });
});
