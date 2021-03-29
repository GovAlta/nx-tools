import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Schema } from './schema';
import generator from './pipeline';

describe('Pipeline Generator', () => {

  const options: Schema = { 
    pipeline: 'test', 
    infra: 'test-infra', 
    dev: 'test-dev' 
  }
  
  it ('can run', async (done) => {
    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);
    expect(host.exists('.openshift/Jenkinsfile')).toBeTruthy();
    expect(host.exists('.openshift/environment.infra.yml')).toBeTruthy();
    expect(host.exists('.openshift/environment.dev.yml')).toBeTruthy();
    
    done();
  });
});
