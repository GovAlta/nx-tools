import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  Tree,
  readProjectConfiguration,
  addProjectConfiguration,
  writeJson,
  readJson,
} from '@nx/devkit';

import generator from './lib';
import { Schema } from './schema';

describe('nx-release generator', () => {
  let appTree: Tree;
  const options: Schema = { project: 'test' };

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addProjectConfiguration(appTree, 'test', {
      root: 'libs/test',
      projectType: 'library',
      targets: {
        build: {
          executor: '@nx/node:package',
          options: {
            outputPath: 'dist/libs/test',
          },
        },
      },
    });
  });

  it('should run successfully', async () => {
    await generator(appTree, options);
    const config = readProjectConfiguration(appTree, 'test');

    expect(config.targets.release).toBeDefined();
    expect(appTree.exists('.releaserc.json')).toBeTruthy();
    expect(appTree.exists('libs/test/.releaserc.json')).toBeTruthy();
  });

  it('should throw when project is not a library', async () => {
    addProjectConfiguration(appTree, 'my-app', {
      root: 'apps/my-app',
      projectType: 'application',
      targets: { build: { executor: '@nx/webpack:webpack', options: {} } },
    });

    await expect(generator(appTree, { project: 'my-app' })).rejects.toThrow(
      'This generator can only be run against buildable libraries.'
    );
  });

  it('should throw when project has no build target', async () => {
    addProjectConfiguration(appTree, 'no-build', {
      root: 'libs/no-build',
      projectType: 'library',
      targets: {},
    });

    await expect(generator(appTree, { project: 'no-build' })).rejects.toThrow(
      'This generator can only be run against buildable libraries.'
    );
  });

  it('should skip root .releaserc.json if present', async () => {
    await generator(appTree, options);
    const config = readProjectConfiguration(appTree, 'test');
    const releaseConfig = { value: 'a' };
    writeJson(appTree, '.releaserc.json', releaseConfig);

    expect(config.targets.release).toBeDefined();
    expect(readJson(appTree, '.releaserc.json')).toMatchObject(releaseConfig);
  });
});
