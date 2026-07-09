import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration } from '@nx/devkit';

import * as utils from '@abgov/nx-oc';
import { environments } from '@abgov/nx-oc';
import angularApp from './angular-app';
import { AngularAppGeneratorSchema } from './schema';

jest.mock('@nx/devkit', () => ({ ...jest.requireActual('@nx/devkit'), formatFiles: jest.fn().mockResolvedValue(undefined) }));
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

describe('angular app generator', () => {
  let appTree: Tree;
  const options: AngularAppGeneratorSchema = {
    name: 'test',
    env: 'dev',
  };

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('should run successfully', async () => {
    await angularApp(appTree, options);
    const config = readProjectConfiguration(appTree, 'test');
    expect(config).toBeDefined();
    expect(config.root).toBe('apps/test');
    expect(appTree.exists('apps/test/nginx.conf')).toBeTruthy();
  }, 120000);

  it('scaffolds a Playwright e2e project (consistent across frontends)', async () => {
    await angularApp(appTree, options);
    expect(appTree.exists('apps/test-e2e/project.json')).toBeTruthy();
    expect(
      appTree.exists('apps/test-e2e/playwright.config.ts') ||
        appTree.exists('apps/test-e2e/playwright.config.mts')
    ).toBe(true);
    expect(appTree.exists('apps/test-e2e/cypress.config.ts')).toBeFalsy();
  }, 120000);

  it('AGENTS.md points at the current design system docs', async () => {
    await angularApp(appTree, options);
    const agents = appTree.read('apps/test/AGENTS.md').toString();
    expect(agents).toContain('design.alberta.ca/components');
    // guard against the retired ui-components.alberta.ca URL creeping back in
    expect(agents).not.toContain('ui-components.alberta.ca');
  }, 120000);

  it('can add nginx proxy', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await angularApp(host, {
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
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await angularApp(host, {
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
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await angularApp(host, {
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
