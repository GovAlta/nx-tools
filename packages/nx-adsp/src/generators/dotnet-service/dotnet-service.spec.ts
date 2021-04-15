import { readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Schema } from './schema';
import generator from './dotnet-service';

describe('Dotnet Service Generator', () => {

  const options: Schema = { 
    name: 'test',
    tenant: 'test'
  }
  
  it ('can run', async (done) => {
    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/test.csproj')).toBeTruthy();
    
    done();
  });
});