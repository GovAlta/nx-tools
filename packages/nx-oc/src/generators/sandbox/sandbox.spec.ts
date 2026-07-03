import {
  addProjectConfiguration,
  readNxJson,
  readProjectConfiguration,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import * as utils from '../../adsp';
import { environments } from '../../adsp';
import generator from './sandbox';
import { Schema } from './schema';

jest.mock('../../adsp');
jest.mock('../../utils/oc-utils', () => ({
  ...jest.requireActual('../../utils/oc-utils'),
  getClusterIngressDomain: jest.fn(() => 'apps.test.example.com'),
}));
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
  accessToken: 'mock-token',
});

describe('Sandbox Generator', () => {
  const options: Schema = {
    project: 'test',
    sandboxProject: 'test-sandbox',
    registry: 'ghcr.io/test-org',
  };

  function addNodeProject(host) {
    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: {
          executor: '@nx/webpack:webpack',
          options: { compiler: 'tsc', target: 'node' },
        },
      },
    });
  }

  function addFrontendProject(host, tags?: string[]) {
    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      tags,
      targets: {
        build: {
          executor: '@nx/webpack:webpack',
          options: { compiler: 'babel' },
        },
      },
    });
  }

  it('generates sandbox manifest for node app', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, options);

    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    const manifest = host.read('.openshift/test/test.yml').toString();
    expect(manifest).toContain('imagePullPolicy: Always');
    expect(manifest).not.toContain('ImageStream');
    expect(manifest).not.toContain('DEPLOY_TAG');
    expect(manifest).toContain('sandbox');
  });

  it('generates sandbox manifest for frontend app', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addFrontendProject(host);

    await generator(host, options);

    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    const manifest = host.read('.openshift/test/test.yml').toString();
    expect(manifest).toContain('imagePullPolicy: Always');
    expect(manifest).not.toContain('ImageStream');
  });

  it('adds a sandbox target wired to the @abgov/nx-oc:sandbox executor', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    const target = config.targets['sandbox'];
    expect(target).toBeTruthy();
    // Deploy orchestration lives in the executor (versioned in the plugin), so
    // the target is thin config — no baked-in command list.
    expect(target.executor).toBe('@abgov/nx-oc:sandbox');
    expect(target.options).toMatchObject({
      sandboxProject: 'test-sandbox',
      registry: 'ghcr.io/test-org',
      appType: 'node',
    });
    // No database key when the app has no database.
    expect(target.options.database).toBeUndefined();

    // The in-cluster BuildConfig flow is gone.
    expect(host.exists('.openshift/test/sandbox-build.yml')).toBeFalsy();
  });

  it('writes a SANDBOX.md deploy/troubleshooting runbook next to the manifests', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, options);

    expect(host.exists('.openshift/test/SANDBOX.md')).toBeTruthy();
    const doc = host.read('.openshift/test/SANDBOX.md').toString();
    expect(doc).toContain('nx run test:sandbox');
    // resume flags + the copy-paste manual-completion sequence
    expect(doc).toContain('--skipBuild');
    expect(doc).toContain('oc import-image test:sandbox');
    expect(doc).toContain('ghcr.io/test-org/test-sandbox-test:sandbox');
    // no unrendered EJS tags leaked through
    expect(doc).not.toContain('<%');
  });

  it('SANDBOX.md is app-type aware (frontend redirect URI; node+db migrate logs)', async () => {
    const fe = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addFrontendProject(fe);
    await generator(fe, options);
    const feDoc = fe.read('.openshift/test/SANDBOX.md').toString();
    expect(feDoc).toContain('Invalid redirect_uri');
    expect(feDoc).not.toContain('-migrate');

    const node = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(node);
    await generator(node, { ...options, database: 'postgres' });
    const nodeDoc = node.read('.openshift/test/SANDBOX.md').toString();
    expect(nodeDoc).toContain('test-migrate');
    expect(nodeDoc).not.toContain('Invalid redirect_uri');
  });

  it('persists the resolved registry to nx.json for reuse', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, options);

    const nxJson = readNxJson(host);
    expect(
      (nxJson.generators as Record<string, { registry?: string }>)[
        '@abgov/nx-oc:sandbox'
      ].registry
    ).toBe('ghcr.io/test-org');
  });

  it('adds sandbox-teardown nx target', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['sandbox-teardown']).toBeTruthy();
    const cmds: string[] = config.targets['sandbox-teardown'].options.commands;
    expect(cmds.some((c) => c.includes('oc delete'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('--ignore-not-found'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('test-sandbox'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('-l app=test'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('all,configmap'))).toBeTruthy();
    // Teardown also removes the sandbox package (best-effort).
    expect(
      cmds.some((c) =>
        c.includes('packages/container/test-sandbox-test')
      )
    ).toBeTruthy();
  });

  it('generates shared postgres manifest with secret-backed DATABASE_URL', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, { ...options, database: 'postgres' });

    expect(host.exists('.openshift/sandbox/sandbox-postgres.yml')).toBeTruthy();

    const dbManifest = host.read('.openshift/sandbox/sandbox-postgres.yml').toString();
    expect(dbManifest).toContain('sandbox-postgres-creds');

    const appManifest = host.read('.openshift/test/test.yml').toString();
    expect(appManifest).toContain('sandbox-postgres-creds');
    expect(appManifest).toContain('$(POSTGRES_PASSWORD)');

    // The database type is passed to the executor, which provisions the shared
    // instance + per-app database at deploy time.
    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['sandbox'].options.database).toBe('postgres');
  });

  it('generates shared mongodb manifest with secret-backed MONGODB_URI', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, { ...options, database: 'mongo' });

    expect(host.exists('.openshift/sandbox/sandbox-mongodb.yml')).toBeTruthy();

    const dbManifest = host.read('.openshift/sandbox/sandbox-mongodb.yml').toString();
    expect(dbManifest).toContain('sandbox-mongodb-creds');

    const appManifest = host.read('.openshift/test/test.yml').toString();
    expect(appManifest).toContain('sandbox-mongodb-creds');
    expect(appManifest).toContain('$(MONGO_PASSWORD)');

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['sandbox'].options.database).toBe('mongo');
  });

  describe('database auto-detection (no --database flag)', () => {
    function addServiceProject(host, extra: Record<string, unknown> = {}) {
      addProjectConfiguration(host, 'test', {
        root: 'apps/test',
        projectType: 'application',
        targets: {
          build: {
            executor: '@nx/webpack:webpack',
            options: { compiler: 'tsc', target: 'node' },
          },
        },
        ...extra,
      });
    }

    it('detects postgres from the adsp:database tag', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      addServiceProject(host, { tags: ['adsp:database:postgres'] });
      await generator(host, options); // options has no database
      expect(
        readProjectConfiguration(host, 'test').targets['sandbox'].options.database
      ).toBe('postgres');
    });

    it('detects mongo from the adsp:database tag', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      addServiceProject(host, { tags: ['adsp:database:mongo'] });
      await generator(host, options);
      expect(
        readProjectConfiguration(host, 'test').targets['sandbox'].options.database
      ).toBe('mongo');
    });

    it('falls back to postgres from a drizzle db:migrate target (pre-tag projects)', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      addServiceProject(host, {
        targets: {
          build: {
            executor: '@nx/webpack:webpack',
            options: { compiler: 'tsc', target: 'node' },
          },
          'db:migrate': { executor: 'nx:run-commands', options: {} },
        },
      });
      await generator(host, options);
      expect(
        readProjectConfiguration(host, 'test').targets['sandbox'].options.database
      ).toBe('postgres');
    });

    it('the --database flag overrides detection', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      addServiceProject(host, { tags: ['adsp:database:postgres'] });
      await generator(host, { ...options, database: 'none' });
      expect(
        readProjectConfiguration(host, 'test').targets['sandbox'].options.database
      ).toBeUndefined(); // explicit none → no database key
    });

    it('leaves database unset when there is no signal', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      addServiceProject(host);
      await generator(host, options);
      expect(
        readProjectConfiguration(host, 'test').targets['sandbox'].options.database
      ).toBeUndefined();
    });
  });

  it('registers the deployment Route redirect URI for a frontend client', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addFrontendProject(host);
    utilsMock.addClientRedirectUris.mockClear();

    await generator(host, options);

    // Route host follows <app>-<namespace>.<ingressDomain>, registered against
    // the public client urn:ads:<tenant>:<app> with the token from ADSP config.
    expect(utilsMock.addClientRedirectUris).toHaveBeenCalledWith(
      environments.test.accessServiceUrl,
      'test',
      'urn:ads:test:test',
      ['https://test-test-sandbox.apps.test.example.com/*'],
      'mock-token'
    );
  });

  it('does not register redirect URIs for a node service', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);
    utilsMock.addClientRedirectUris.mockClear();

    await generator(host, options);

    expect(utilsMock.addClientRedirectUris).not.toHaveBeenCalled();
  });
});
