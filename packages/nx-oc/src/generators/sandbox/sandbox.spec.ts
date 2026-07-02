import {
  addProjectConfiguration,
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

  it('adds sandbox nx target', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['sandbox']).toBeTruthy();
    expect(config.targets['sandbox'].executor).toBe('nx:run-commands');
    // Commands run in order (nx:run-commands has no `sequential` option).
    expect(config.targets['sandbox'].options.parallel).toBe(false);
    const cmds: string[] = config.targets['sandbox'].options.commands;
    expect(cmds.some((c) => c.includes('oc rollout restart'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('oc rollout status'))).toBeTruthy();
    // In-cluster binary build (no local podman / external registry route).
    expect(cmds.some((c) => c.includes('nx build test'))).toBeTruthy();
    expect(
      cmds.some((c) => c.includes('oc start-build test --from-dir=.'))
    ).toBeTruthy();
    expect(cmds.some((c) => c.includes('sandbox-build.yml'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('podman'))).toBeFalsy();
    // A node service's ADSP client secret is mirrored from .env into an
    // OpenShift Secret the deployment reads.
    expect(
      cmds.some(
        (c) =>
          c.includes('oc create secret generic test-secrets') &&
          c.includes('CLIENT_SECRET')
      )
    ).toBeTruthy();

    // The ImageStream + BuildConfig manifest is generated.
    expect(host.exists('.openshift/test/sandbox-build.yml')).toBeTruthy();
    const buildManifest = host
      .read('.openshift/test/sandbox-build.yml')
      .toString();
    expect(buildManifest).toContain('kind: BuildConfig');
    expect(buildManifest).toContain('kind: ImageStream');
    expect(buildManifest).toContain('test:sandbox');
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

    const config = readProjectConfiguration(host, 'test');
    const cmds: string[] = config.targets['sandbox'].options.commands;
    expect(cmds.some((c) => c.includes('sandbox-postgres-creds'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('sandbox-postgres.yml'))).toBeTruthy();
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
    const cmds: string[] = config.targets['sandbox'].options.commands;
    expect(cmds.some((c) => c.includes('sandbox-mongodb-creds'))).toBeTruthy();
  });

  it('ensures paired backend Services from proxy-service tags', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addFrontendProject(host, ['adsp:proxy-service:test-service:3333']);

    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    const cmds: string[] = config.targets['sandbox'].options.commands;
    const guard = cmds.find((c) => c.includes('oc get service test-service'));
    expect(guard).toBeTruthy();
    // idempotent: only creates the Service (for DNS) when it's missing — no
    // backend deployment, which would have no image until its own sandbox runs.
    expect(guard).toContain('||');
    expect(guard).toContain(
      'oc create service clusterip test-service --tcp=3333:3333'
    );
    expect(guard).not.toContain('test-service.yml');
  });

  it('adds no paired-service guard when there are no proxy-service tags', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    const cmds: string[] = config.targets['sandbox'].options.commands;
    expect(cmds.some((c) => c.includes('oc get service'))).toBeFalsy();
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
