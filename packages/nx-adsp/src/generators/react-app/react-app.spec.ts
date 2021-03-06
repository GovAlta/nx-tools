import { readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Schema } from './schema';
import generator from './react-app';

describe('React App Generator', () => {
  beforeEach(() => {
    jest.setTimeout(28000)
  })

  afterAll(() => {
   jest.clearAllTimers()
  })

  const options: Schema = {
    name: 'test',
    tenant: 'test',
  }

  it ('can run', async () => {
    jest.setTimeout(28000)
    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
  });

  it ('can add nginx proxy', async () => {
    const host = createTreeWithEmptyWorkspace();
    await generator(
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
  });

  it ('can add multiple nginx proxy', async () => {
    const host = createTreeWithEmptyWorkspace();
    await generator(
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
  });

  it ('can add webpack dev server proxy', async () => {
    const host = createTreeWithEmptyWorkspace();
    await generator(
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
  });
});
