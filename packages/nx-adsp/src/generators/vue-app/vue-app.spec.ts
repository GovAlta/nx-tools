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
    // nginx.conf + silent-check-sso live in the Vite publicDir so they end up in the build output.
    expect(host.exists('apps/test/public/nginx.conf')).toBeTruthy();
    expect(host.exists('apps/test/public/silent-check-sso.html')).toBeTruthy();
    expect(host.exists('apps/test/src/main.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/App.vue')).toBeTruthy();
    expect(host.exists('apps/test/src/router/index.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/environments/environment.ts')).toBeTruthy();
    expect(host.exists('apps/test/vite.config.ts')).toBeTruthy();
    // The duplicate @nx/vue-generated config is removed.
    expect(host.exists('apps/test/vite.config.mts')).toBeFalsy();
    // build output mirrors the workspace layout under the root dist/.
    expect(config.targets.build.options.outputPath).toBe('dist/apps/test');
  }, 30000);

  it('index.html is at the Vite entry root and its mount target matches main.ts', async () => {
    await generator(host, options);
    // Vite's entry is <projectRoot>/index.html, not src/index.html — a template
    // shipped under src/ is ignored, leaving @nx/vue's #root div while main.ts
    // mounts #app, so nothing renders. Guard both: correct path and matched id.
    expect(host.exists('apps/test/index.html')).toBeTruthy();
    expect(host.exists('apps/test/src/index.html')).toBeFalsy();
    const indexHtml = host.read('apps/test/index.html').toString();
    const mainTs = host.read('apps/test/src/main.ts').toString();
    const mountId = mainTs.match(/\.mount\(['"]#([\w-]+)['"]\)/)?.[1];
    expect(mountId).toBeTruthy();
    expect(indexHtml).toContain(`id="${mountId}"`);
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
    const nginxConf = host.read('apps/test/public/nginx.conf').toString();
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
    const nginxConf = host.read('apps/test/public/nginx.conf').toString();
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
