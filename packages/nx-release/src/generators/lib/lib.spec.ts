import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Tree, readProjectConfiguration, addProjectConfiguration } from '@nrwl/devkit';

import generator from './lib';
import { Schema } from './schema';

describe('nx-release generator', () => {
  let appTree: Tree;
  const options: Schema = { project: 'test' };

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace();
    addProjectConfiguration(
      appTree, 
      'test', 
      {
        root: 'libs/test',
        projectType: 'library',
        targets: {
          build: {
            executor: '@nrwl/node:package',
            options: {
              outputPath: 'dist/libs/test'
            }
          }
        }
      }
    );
  });

  it('should run successfully', async () => {
    await generator(appTree, options);
    const config = readProjectConfiguration(appTree, 'test');
    expect(config).toBeDefined();
  });
});
