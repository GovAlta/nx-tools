import {
  addProjectConfiguration,
  readProjectConfiguration,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import pipeline from '../pipeline/pipeline';
import generator from './teardown';
import { Schema } from './schema';

describe('Teardown Generator', () => {
  const options: Schema = {
    project: 'test',
    env: 'dev',
  };

  async function setup(host, envs = 'test-dev test-test test-prod') {
    await pipeline(host, {
      pipeline: 'test',
      registry: 'ghcr.io/test-org',
      type: 'jenkins',
      infra: 'test-infra',
      envs,
    });
    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: { executor: '@nx/webpack:webpack', options: { compiler: 'tsc', target: 'node' } },
      },
    });
  }

  it('adds teardown-dev target for dev environment', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await setup(host);

    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['teardown-dev']).toBeTruthy();
    const cmds: string[] = config.targets['teardown-dev'].options.commands;
    expect(cmds.some((c) => c.includes('oc delete'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('test-dev'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('--ignore-not-found'))).toBeTruthy();
  });

  it('adds teardown-prod target for prod environment', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await setup(host);

    await generator(host, { ...options, env: 'prod' });

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['teardown-prod']).toBeTruthy();
    const cmds: string[] = config.targets['teardown-prod'].options.commands;
    expect(cmds.some((c) => c.includes('test-prod'))).toBeTruthy();
  });

  it('teardown targets for multiple environments are additive', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await setup(host);

    await generator(host, { ...options, env: 'dev' });
    await generator(host, { ...options, env: 'test' });
    await generator(host, { ...options, env: 'prod' });

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['teardown-dev']).toBeTruthy();
    expect(config.targets['teardown-test']).toBeTruthy();
    expect(config.targets['teardown-prod']).toBeTruthy();
  });

  it('skips gracefully when environments.yml does not exist', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: { executor: '@nx/webpack:webpack', options: { compiler: 'tsc', target: 'node' } },
      },
    });

    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['teardown-dev']).toBeFalsy();
  });

  it('uses label selector with project name in delete command', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await setup(host);

    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    const cmds: string[] = config.targets['teardown-dev'].options.commands;
    expect(cmds.some((c) => c.includes('-l app=test'))).toBeTruthy();
    expect(cmds.some((c) => c.includes('all,configmap'))).toBeTruthy();
  });
});
