import { readProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import * as utils from '@abgov/nx-oc';
import { environments } from '@abgov/nx-oc';
import { Schema } from './schema';
import generator from './mern';

jest.mock('@abgov/nx-oc');
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});

describe('React App Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    const appConfig = readProjectConfiguration(host, 'test-app');
    expect(appConfig.root).toBe('apps/test-app');

    const serviceConfig = readProjectConfiguration(host, 'test-service');
    expect(serviceConfig.root).toBe('apps/test-service');

    expect(host.exists('apps/test-app/nginx.conf')).toBeTruthy();
    const nginxConf = host.read('apps/test-app/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/');
  }, 30000);
});
