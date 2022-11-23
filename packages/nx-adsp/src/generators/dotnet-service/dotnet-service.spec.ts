import {
  addDependenciesToPackageJson,
  readProjectConfiguration,
} from '@nrwl/devkit';
import { createTreeWithEmptyV1Workspace } from '@nrwl/devkit/testing';
import { Schema } from './schema';
import generator from './dotnet-service';

describe('Dotnet Service Generator', () => {
  const options: Schema = {
    name: 'test',
    tenant: 'test',
  };

  it.skip('can run', async () => {
    const host = createTreeWithEmptyV1Workspace();
    addDependenciesToPackageJson(
      host,
      {},
      {
        '@nx-dotnet/core': '^1.15.0',
      }
    );
    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/test.csproj')).toBeTruthy();
  });
});
