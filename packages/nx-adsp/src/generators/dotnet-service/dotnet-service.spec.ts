import { addDependenciesToPackageJson } from '@nrwl/devkit';
import { createTreeWithEmptyV1Workspace } from '@nrwl/devkit/testing';
import appGenerator from '@nx-dotnet/core/src/generators/app/generator';
import refGenerator from '@nx-dotnet/core/src/generators/nuget-reference/generator';

import * as utils from '../../utils/adsp-utils';
import { environments } from '../../utils/environments';
import { Schema } from './schema';
import generator from './dotnet-service';

jest.mock('@nx-dotnet/core/src/generators/app/generator');
jest.mock('@nx-dotnet/core/src/generators/nuget-reference/generator');

const appGeneratorMock = appGenerator as jest.Mocked<typeof appGenerator>;
const refGeneratorMock = refGenerator as jest.Mocked<typeof refGenerator>;

jest.mock('../../utils/adsp-utils', () => ({
  ...jest.requireActual('../../utils/adsp-utils'),
  getAdspConfiguration: jest.fn(),
}));
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});

describe('Dotnet Service Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
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
