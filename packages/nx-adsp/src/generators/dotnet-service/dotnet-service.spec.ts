import { addDependenciesToPackageJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import appGenerator from '@nx-dotnet/core/src/generators/app/generator';
import refGenerator from '@nx-dotnet/core/src/generators/nuget-reference/generator';

import * as utils from '@abgov/nx-oc';
import { environments } from '@abgov/nx-oc';
import { Schema } from './schema';
import generator from './dotnet-service';

jest.mock('@nx-dotnet/core/src/generators/app/generator');
jest.mock('@nx-dotnet/core/src/generators/nuget-reference/generator');

const appGeneratorMock = appGenerator as jest.Mocked<typeof appGenerator>;
const refGeneratorMock = refGenerator as jest.Mocked<typeof refGenerator>;

jest.mock('@abgov/nx-oc', () => ({
  ...jest.requireActual('@abgov/nx-oc'),
  getAdspConfiguration: jest.fn(),
  deploymentGenerator: jest.fn(),
}));
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});
utilsMock.deploymentGenerator.mockResolvedValue();

describe('Dotnet Service Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
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
    expect(utils.deploymentGenerator).toHaveBeenCalled();
    host.exists('apps/test/Program.cs');
  });
});
