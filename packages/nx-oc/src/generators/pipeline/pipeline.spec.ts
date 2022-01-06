import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Schema } from './schema';
import generator from './pipeline';

describe('Pipeline Generator', () => {

  describe('Jenkins', () => {
    const options: Schema = { 
      pipeline: 'test', 
      type: 'jenkins',
      infra: 'test-infra', 
      envs: 'test-dev' 
    }
    
    it ('can run', async () => {
      const host = createTreeWithEmptyWorkspace();
      await generator(host, options);
      expect(host.exists('.openshift/Jenkinsfile')).toBeTruthy();
      expect(host.exists('.openshift/environment.infra.yml')).toBeTruthy();
      expect(host.exists('.openshift/environments.yml')).toBeTruthy();
    });
    
    it ('can generate multiple envs', async () => {
      const host = createTreeWithEmptyWorkspace();
      await generator(host, { ...options, envs: 'test-dev test-test' });
      expect(host.exists('.openshift/environments.yml')).toBeTruthy();
      
      const envs = host.read('.openshift/environments.yml').toString();
      expect(envs).toContain('test-dev');
      expect(envs).toContain('test-test');
    });
  
    it ('can fail for duplicate env project', async () => {
      const host = createTreeWithEmptyWorkspace();
      await expect(
        generator(host, { ...options, envs: 'test-dev test-dev' })
      ).rejects.toThrow('Each environment must be a unique project.');
    });
  });
  
  describe('GitHub Actions', () => {
    const options: Schema = { 
      pipeline: 'test', 
      type: 'actions',
      infra: 'test-infra', 
      envs: 'test-dev' 
    }
    
    it ('can run', async () => {
      const host = createTreeWithEmptyWorkspace();
      await generator(host, options);
      expect(host.exists('.github/workflows/pipeline.yml')).toBeTruthy();
      expect(host.exists('.openshift/environment.infra.yml')).toBeTruthy();
      expect(host.exists('.openshift/environments.yml')).toBeTruthy();
    });
    
    it ('can generate multiple envs', async () => {
      const host = createTreeWithEmptyWorkspace();
      await generator(host, { ...options, envs: 'test-dev test-test' });
      expect(host.exists('.openshift/environments.yml')).toBeTruthy();
      
      const envs = host.read('.openshift/environments.yml').toString();
      expect(envs).toContain('test-dev');
      expect(envs).toContain('test-test');
    });
  
    it ('can fail for duplicate env project', async () => {
      const host = createTreeWithEmptyWorkspace();
      await expect(
        generator(host, { ...options, envs: 'test-dev test-dev' })
      ).rejects.toThrow('Each environment must be a unique project.');
    });
  });
});
