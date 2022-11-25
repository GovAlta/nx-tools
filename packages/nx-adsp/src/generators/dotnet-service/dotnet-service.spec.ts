import { addDependenciesToPackageJson } from '@nrwl/devkit';
import { createTreeWithEmptyV1Workspace } from '@nrwl/devkit/testing';
import appGenerator from '@nx-dotnet/core/src/generators/app/generator';
import refGenerator from '@nx-dotnet/core/src/generators/nuget-reference/generator';
import { Schema } from './schema';
import generator from './dotnet-service';

jest.mock('@nx-dotnet/core/src/generators/app/generator');
jest.mock('@nx-dotnet/core/src/generators/nuget-reference/generator');

const appGeneratorMock = appGenerator as jest.Mocked<typeof appGenerator>;
const refGeneratorMock = refGenerator as jest.Mocked<typeof refGenerator>;

describe('Dotnet Service Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
    realm: 'test',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyV1Workspace();
    addDependenciesToPackageJson(
      host,
      {},
      {
        '@nx-dotnet/core': '^1.16.0',
      }
    );
    await generator(host, options);
    expect(appGeneratorMock).toHaveBeenCalled();
    expect(refGeneratorMock).toHaveBeenCalled();
    host.exists('apps/test/Program.cs');
  });
});
