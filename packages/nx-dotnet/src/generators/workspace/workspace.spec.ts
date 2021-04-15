import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Tree } from '@nrwl/devkit';

import generator from './workspace';
import { Schema } from './schema';

describe('nx-dotnet workspace', () => {
  let appTree: Tree;
  const options: Schema = { name: 'test' };

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    await generator(appTree, options);
    expect(appTree.exists('Directory.Build.props')).toBeTruthy();
    expect(appTree.exists('Directory.Build.targets')).toBeTruthy();
  });
});
