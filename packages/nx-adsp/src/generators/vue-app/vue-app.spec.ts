import { readProjectConfiguration, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import * as utils from '@abgov/nx-oc';
import { environments } from '@abgov/nx-oc';
import { Schema } from './schema';
import generator from './vue-app';

jest.mock('@nx/devkit', () => ({
  ...jest.requireActual('@nx/devkit'),
  formatFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@abgov/nx-oc');
jest.mock('../../utils/agent', () => ({
  consultAgent: jest.fn().mockResolvedValue(null),
  confirmAfterAgentInterrupt: jest.fn().mockResolvedValue(undefined),
}));

const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});

describe('Vue App Generator', () => {
  let host: Tree;
  const options: Schema = { name: 'test', env: 'dev' };

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('can run', async () => {
    await generator(host, options);
    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');
    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
    expect(host.exists('apps/test/src/main.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/App.vue')).toBeTruthy();
    expect(host.exists('apps/test/src/router/index.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/environments/environment.ts')).toBeTruthy();
    expect(host.exists('apps/test/vite.config.ts')).toBeTruthy();
  }, 30000);

  it('vite.config.ts marks goa-* elements as custom elements', async () => {
    await generator(host, options);
    const viteConfig = host.read('apps/test/vite.config.ts').toString();
    expect(viteConfig).toContain("isCustomElement: (tag) => tag.startsWith('goa-')");
  }, 30000);

  it('environment.ts is pre-populated with tenant config', async () => {
    await generator(host, options);
    const env = host.read('apps/test/src/environments/environment.ts').toString();
    expect(env).toContain(environments.test.accessServiceUrl);
    expect(env).toContain(environments.test.directoryServiceUrl);
    expect(env).toContain('urn:ads:test:test');
  }, 30000);

  it('can add nginx proxy', async () => {
    await generator(host, {
      ...options,
      proxy: { location: '/test/', proxyPass: 'http://test-service:3333/' },
    });
    const nginxConf = host.read('apps/test/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/');
  });

  it('can add multiple nginx proxies', async () => {
    await generator(host, {
      ...options,
      proxy: [
        { location: '/test/', proxyPass: 'http://test-service:3333/' },
        { location: '/test2/', proxyPass: 'http://test-service2:3333/' },
      ],
    });
    const nginxConf = host.read('apps/test/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/');
    expect(nginxConf).toContain('http://test-service2:3333/');
  });

  it('writes vite dev proxy config when proxy is configured', async () => {
    await generator(host, {
      ...options,
      proxy: { location: '/test/', proxyPass: 'http://test-service:3333/api/' },
    });
    expect(host.exists('apps/test/vite.proxy.json')).toBeTruthy();
    const proxyConf = JSON.parse(host.read('apps/test/vite.proxy.json').toString());
    expect(proxyConf['/test/'].target).toBe('http://localhost:3333');
    expect(proxyConf['/test/'].pathRewrite['^/test/']).toBe('/api/');
  });
});
