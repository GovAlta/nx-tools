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
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
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

  function addFrontendProject(host) {
    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
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
    const cmds: string[] = config.targets['sandbox'].options.commands;
    expect(cmds.some((c) => c.includes('oc rollout restart'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('oc rollout status'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('command -v podman'))).toBeTruthy();
  });

  it('generates shared postgres manifest and inlines DATABASE_URL', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, { ...options, database: 'postgres' });

    expect(host.exists('.openshift/sandbox/sandbox-postgres.yml')).toBeTruthy();
    const manifest = host.read('.openshift/test/test.yml').toString();
    expect(manifest).toContain('sandbox-postgres');
    expect(manifest).not.toContain('secretKeyRef');
    const config = readProjectConfiguration(host, 'test');
    const cmds: string[] = config.targets['sandbox'].options.commands;
    expect(cmds.some((c) => c.includes('sandbox-postgres.yml'))).toBeTruthy();
  });

  it('generates shared mongodb manifest and inlines MONGODB_URI', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addNodeProject(host);

    await generator(host, { ...options, database: 'mongo' });

    expect(host.exists('.openshift/sandbox/sandbox-mongodb.yml')).toBeTruthy();
    const manifest = host.read('.openshift/test/test.yml').toString();
    expect(manifest).toContain('sandbox-mongodb');
    expect(manifest).not.toContain('secretKeyRef');
  });
});
