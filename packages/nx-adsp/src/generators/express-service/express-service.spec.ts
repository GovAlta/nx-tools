import { readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyV1Workspace } from '@nrwl/devkit/testing';
import { Schema } from './schema';
import generator from './express-service';

describe('Express Service Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
    realm: 'test',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyV1Workspace();
    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/src/main.ts')).toBeTruthy();
  });
});
