import { readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Schema } from './schema';
import generator from './mern';

describe('React App Generator', () => {

  const options: Schema = { 
    name: 'test',
    tenant: 'test',
  }
  
  it ('can run', async (done) => {
    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);

    const appConfig = readProjectConfiguration(host, 'test-app');
    expect(appConfig.root).toBe('apps/test-app');

    const serviceConfig = readProjectConfiguration(host, 'test-service');
    expect(serviceConfig.root).toBe('apps/test-service');
    
    expect(host.exists('apps/test-app/nginx.conf')).toBeTruthy();
    const nginxConf = host.read('apps/test-app/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/');
    
    done();
  });
});