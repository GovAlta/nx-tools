import { readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyV1Workspace } from '@nrwl/devkit/testing';

import * as utils from '../../utils/adsp-utils';
import { environments } from '../../utils/environments';
import { Schema } from './schema';
import generator from './react-app';

jest.mock('../../utils/adsp-utils');
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
    const host = createTreeWithEmptyV1Workspace();
    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
  }, 30000);

  it('can add nginx proxy', async () => {
    const host = createTreeWithEmptyV1Workspace();
    await generator(host, {
      ...options,
      proxy: {
        location: '/test/',
        proxyPass: 'http://test-service:3333/',
      },
    });

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
    expect(host.read('apps/test/nginx.conf').toString()).toContain(
      'http://test-service:3333/'
    );
  });

  it('can add multiple nginx proxy', async () => {
    const host = createTreeWithEmptyV1Workspace();
    await generator(host, {
      ...options,
      proxy: [
        {
          location: '/test/',
          proxyPass: 'http://test-service:3333/',
        },
        {
          location: '/test2/',
          proxyPass: 'http://test-service2:3333/',
        },
      ],
    });

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
    const nginxConf = host.read('apps/test/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/');
    expect(nginxConf).toContain('http://test-service2:3333/');
  });

  it('can add webpack dev server proxy', async () => {
    const host = createTreeWithEmptyV1Workspace();
    await generator(host, {
      ...options,
      proxy: {
        location: '/test/',
        proxyPass: 'http://test-service:3333/api/',
      },
    });

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/proxy.conf.json')).toBeTruthy();

    const proxyConf = JSON.parse(
      host.read('apps/test/proxy.conf.json').toString()
    );
    expect(proxyConf['/test/'].target).toBe('http://localhost:3333');
    expect(proxyConf['/test/'].pathRewrite['^/test/']).toBe('/api/');
  });
});
