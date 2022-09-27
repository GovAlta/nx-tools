import {
  addProjectConfiguration,
  readProjectConfiguration,
} from '@nrwl/devkit';
import { createTreeWithEmptyV1Workspace } from '@nrwl/devkit/testing';
import pipeline from '../pipeline/pipeline';
import { Schema } from './schema';
import generator from './deployment';
describe('Deployment Generator', () => {
  const options: Schema = { project: 'test', tenant: 'test' };

  it('can run', async () => {
    const host = createTreeWithEmptyV1Workspace();
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
          executor: '@nrwl/web:webpack',
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
    const host = createTreeWithEmptyV1Workspace();
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
          executor: '@nrwl/web:webpack',
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
    const host = createTreeWithEmptyV1Workspace();
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

  it('can generate deployment for express', async () => {
    const host = createTreeWithEmptyV1Workspace();
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
          executor: '@nrwl/node:build',
        },
      },
    });

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('node');
  });

  it('can generate deployment for dotnet', async () => {
    const host = createTreeWithEmptyV1Workspace();
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
          executor: '@abgov/nx-dotnet:build',
        },
      },
    });

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('dotnet');
  });

  it('can skip unknown project type', async () => {
    const host = createTreeWithEmptyV1Workspace();
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

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeFalsy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeFalsy();

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['apply-envs']).toBeFalsy();
  });
});
