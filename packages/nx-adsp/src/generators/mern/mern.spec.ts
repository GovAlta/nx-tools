import { readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyV1Workspace } from '@nrwl/devkit/testing';
import { Schema } from './schema';
import generator from './mern';

describe('React App Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
    realm: 'test',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyV1Workspace();
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
