import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Schema } from './schema';
import generator from './pipeline';

describe('Pipeline Generator', () => {

  const options: Schema = { 
    pipeline: 'test', 
    infra: 'test-infra', 
    envs: 'test-dev' 
  }
  
  it ('can run', async (done) => {
    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);
    expect(host.exists('.openshift/Jenkinsfile')).toBeTruthy();
    expect(host.exists('.openshift/environment.infra.yml')).toBeTruthy();
    expect(host.exists('.openshift/environments.yml')).toBeTruthy();
    
    done();
  });
  
  it ('can generate multiple envs', async (done) => {
    const host = createTreeWithEmptyWorkspace();
    await generator(host, { ...options, envs: 'test-dev test-test' });
    expect(host.exists('.openshift/environments.yml')).toBeTruthy();
    
    const envs = host.read('.openshift/environments.yml').toString();
    expect(envs).toContain('test-dev');
    expect(envs).toContain('test-test');
    
    done();
  });

  it ('can fail for duplicate env project', async (done) => {
    
    const host = createTreeWithEmptyWorkspace();
    await expect(
      generator(host, { ...options, envs: 'test-dev test-dev' })
    ).rejects.toThrow('Each environment must be a unique project.');

    done();
  })
});
