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
    
    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['apply-envs']).toBeTruthy();
    expect(config.targets['apply-envs'].executor).toBe('@abgov/nx-oc:apply');
    expect(config.targets['apply-envs'].options.ocProject).toContain('test-dev');
   
    done();
  });

  it ('can generate deployment for react', async (done) => {
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

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('nginx');
   
    done();
  });

  it ('can generate deployment for angular', async (done) => {
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
          executor: '@angular-devkit/build-angular:browser'
        }
      }
    });

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('nginx');
   
    done();
  });

  it ('can generate deployment for express', async (done) => {
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
          executor: '@nrwl/node:build'
        }
      }
    });

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('node');
   
    done();
  });

  it ('can generate deployment for dotnet', async (done) => {
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
          executor: '@abgov/nx-dotnet:build'
        }
      }
    });

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeTruthy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeTruthy();

    const dockerfile = host.read('.openshift/test/Dockerfile').toString();
    expect(dockerfile).toContain('dotnet');
   
    done();
  });

  it ('can skip unknown project type', async (done) => {
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
          executor: '@nrwl/not-real:build'
        }
      }
    });

    await generator(host, options);
    expect(host.exists('.openshift/test/test.yml')).toBeFalsy();
    expect(host.exists('.openshift/test/Dockerfile')).toBeFalsy();
    
    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['apply-envs']).toBeFalsy();
    
    done();
  });
});
