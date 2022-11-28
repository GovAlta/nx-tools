import { readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyV1Workspace } from '@nrwl/devkit/testing';

import * as utils from '../../utils/adsp-utils';
import { environments } from '../../utils/environments';
import serviceGenerator from '../dotnet-service/dotnet-service';
import { Schema } from './schema';
import generator from './react-dotnet';

jest.mock('../../utils/adsp-utils');
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});

jest.mock('../dotnet-service/dotnet-service');
const serviceGeneratorMock = serviceGenerator as jest.Mocked<
  typeof serviceGenerator
>;

describe('React App Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyV1Workspace();
    await generator(host, options);

    const appConfig = readProjectConfiguration(host, 'test-app');
    expect(appConfig.root).toBe('apps/test-app');

    expect(serviceGeneratorMock).toHaveBeenCalled();

    expect(host.exists('apps/test-app/nginx.conf')).toBeTruthy();
    const nginxConf = host.read('apps/test-app/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:5000/');
  }, 30000);
});
