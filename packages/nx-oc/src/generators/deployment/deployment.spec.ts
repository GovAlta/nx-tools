import { addProjectConfiguration, readProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import * as utils from '../../adsp';
import { environments } from '../../adsp';
import pipeline from '../pipeline/pipeline';
import { Schema } from './schema';
import generator from './deployment';

jest.mock('../../adsp');
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});

describe('Deployment Generator', () => {
  const options: Schema = {
    project: 'test',
    env: 'development',
    appType: 'frontend',
    adsp: {
      tenant: 'test',
      tenantRealm: 'test',
      accessServiceUrl: 'https://access-uat.alberta.ca',
      directoryServiceUrl: 'https://directory',
    },
  };

  it('can run', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await pipeline(host, {
      pipeline: 'test',
      type: 'jenkins',
      infra: 'test-infra',
      envs: 'test-dev',
    });

    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: {
          executor: '@nx/web:webpack',
        },
      },
    });

    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['apply-envs']).toBeTruthy();
    expect(config.targets['apply-envs'].executor).toBe('@abgov/nx-oc:apply');
    expect(config.targets['apply-envs'].options.ocProject).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ project: 'test-dev', tag: 'dev' }),
      ])
    );
  });

  it('can generate deployment for react', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await pipeline(host, {
      pipeline: 'test',
      type: 'jenkins',
      infra: 'test-infra',
      envs: 'test-dev',
    });

    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: {
          executor: '@nx/webpack:webpack',
          options: {
            compiler: 'babel',
          },
        },
      },
    });

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('nginx');
  });

  it('can generate deployment for angular', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await pipeline(host, {
      pipeline: 'test',
      type: 'jenkins',
      infra: 'test-infra',
      envs: 'test-dev',
    });

    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: {
          executor: '@angular-devkit/build-angular:browser',
        },
      },
    });

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('nginx');
  });

  it('can generate deployment for node', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await pipeline(host, {
      pipeline: 'test',
      type: 'jenkins',
      infra: 'test-infra',
      envs: 'test-dev',
    });

    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: {
          executor: '@nx/webpack:webpack',
          options: {
            compiler: 'tsc',
            target: 'node',
          },
        },
      },
    });

    await generator(host, { ...options, appType: 'node' });
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('node');
  });

  it('can generate deployment for dotnet', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await pipeline(host, {
      pipeline: 'test',
      type: 'jenkins',
      infra: 'test-infra',
      envs: 'test-dev',
    });

    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: {
          executor: '@nx-dotnet/core:build',
        },
      },
    });

    await generator(host, { ...options, appType: 'dotnet' });
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('dotnet');
  });

  it('can skip unknown project type', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await pipeline(host, {
      pipeline: 'test',
      type: 'jenkins',
      infra: 'test-infra',
      envs: 'test-dev',
    });

    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: {
          executor: '@nrwl/not-real:build',
        },
      },
    });

    await generator(host, { ...options, appType: null });
    expect(host.exists('.openshift/test/test.yml')).toBeFalsy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeFalsy();

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['apply-envs']).toBeFalsy();
  });
});
