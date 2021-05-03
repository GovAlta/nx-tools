import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Tree, readProjectConfiguration } from '@nrwl/devkit';

import angularApp from './angular-app';
import { AngularAppGeneratorSchema } from './schema';

describe('angular app generator', () => {
  let appTree: Tree;
  const options: AngularAppGeneratorSchema = { name: 'test', tenant: 'testtenant' };

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace();
    jest.setTimeout(28000)
  });
  afterAll(() => {
   jest.clearAllTimers()
  })

  it('should run successfully', async (done) => {
    await angularApp(appTree, options);
    const config = readProjectConfiguration(appTree, 'test');
    expect(config).toBeDefined();
    expect(config.root).toBe('apps/test');
    expect(appTree.exists('apps/test/nginx.conf')).toBeTruthy();

    done();
  });

  it ('can add nginx proxy', async (done) => {
    const host = createTreeWithEmptyWorkspace();
    await angularApp(
      host,
      {
        ...options,
        proxy: {
          location: '/test/',
          proxyPass: 'http://test-service:3333/'
        }
      }
    );

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
    expect(
      host.read('apps/test/nginx.conf').toString()
    ).toContain('http://test-service:3333/');

    done();
  });

  it ('can add multiple nginx proxy', async (done) => {
    const host = createTreeWithEmptyWorkspace();
    await angularApp(
      host,
      {
        ...options,
        proxy: [
          {
            location: '/test/',
            proxyPass: 'http://test-service:3333/'
          },
          {
            location: '/test2/',
            proxyPass: 'http://test-service2:3333/'
          }
        ]
      }
    );

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
    const nginxConf = host.read('apps/test/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/');
    expect(nginxConf).toContain('http://test-service2:3333/');

    done();
  });

  it ('can add webpack dev server proxy', async (done) => {
    const host = createTreeWithEmptyWorkspace();
    await angularApp(
      host,
      {
        ...options,
        proxy: {
          location: '/test/',
          proxyPass: 'http://test-service:3333/api/'
        }
      }
    );

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/proxy.conf.json')).toBeTruthy();

    const proxyConf = JSON.parse(
      host.read('apps/test/proxy.conf.json').toString()
    );
    expect(proxyConf['/test/'].target).toBe('http://localhost:3333');
    expect(proxyConf['/test/'].pathRewrite['^/test/']).toBe('/api/');

    done();
  });
});
