import { addProjectConfiguration, readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import pipeline from '../pipeline/pipeline';
import { Schema } from './schema';
import generator from './deployment';
describe('Deployment Generator', () => {

  const options: Schema = { project: 'test', tenant: 'test' }

  it ('can run', async (done) => {
    const host = createTreeWithEmptyWorkspace();
    await pipeline(
      host, 
      { 
        pipeline: 'test', 
        infra: 'test-infra', 
        envs: 'test-dev' 
      }
    );

    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: {
          executor: '@nrwl/web:build'
        }
      }
    });

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();
    
    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['apply-envs']).toBeTruthy();
    expect(config.targets['apply-envs'].executor).toBe('@abgov/nx-oc:apply');
    expect(config.targets['apply-envs'].options.ocProject).toContain('test-dev');
   
    done();
  });
});
