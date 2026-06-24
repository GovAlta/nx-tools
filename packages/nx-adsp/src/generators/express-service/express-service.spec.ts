import { readProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import * as utils from '@abgov/nx-oc';
import { environments } from '@abgov/nx-oc';
import { Schema } from './schema';
import generator from './express-service';

jest.mock('@abgov/nx-oc');
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});
utilsMock.deploymentGenerator.mockResolvedValue(undefined);
utilsMock.realmLogin.mockResolvedValue('test-token');

describe('Express Service Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/src/main.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/environment.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/environments/environment.ts')).toBeFalsy();
  }, 60000);

  it('includes authorize, createValidationHandler, and example route in main.ts', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    const mainTs = host.read('apps/test/src/main.ts').toString();
    expect(mainTs).toContain('authorize');
    expect(mainTs).toContain('createValidationHandler');
    expect(mainTs).toContain('createErrorHandler');
    expect(mainTs).toContain('/v1/example');
    expect(mainTs).toContain('eventService.send');
  }, 60000);

  it('scaffolds postgres database files and targets', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, { ...options, database: 'postgres' });

    expect(host.exists('apps/test/prisma/schema.prisma')).toBeTruthy();
    expect(host.exists('apps/test/src/database.ts')).toBeTruthy();
    expect(host.exists('apps/test/scripts/dev-db.sh')).toBeTruthy();
    expect(host.exists('apps/test/.env.example')).toBeTruthy();

    const schema = host.read('apps/test/prisma/schema.prisma').toString();
    expect(schema).toContain('postgresql');
    expect(schema).toContain('src/generated/prisma');

    const database = host.read('apps/test/src/database.ts').toString();
    expect(database).toContain('./generated/prisma');

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['dev-db']).toBeTruthy();
    expect(config.targets['db:generate']).toBeTruthy();
    expect(config.targets['db:migrate']).toBeTruthy();
    expect(config.targets['db:migrate:deploy']).toBeTruthy();
    expect(config.targets['db:studio']).toBeTruthy();
    expect(config.targets['serve'].dependsOn).toContain('dev-db');
    expect(config.targets['build'].dependsOn).toContain('db:generate');
  }, 60000);

  it('scaffolds mongo database files and targets', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, { ...options, database: 'mongo' });

    expect(host.exists('apps/test/src/database.ts')).toBeTruthy();
    expect(host.exists('apps/test/scripts/dev-db.sh')).toBeTruthy();
    expect(host.exists('apps/test/.env.example')).toBeTruthy();

    const database = host.read('apps/test/src/database.ts').toString();
    expect(database).toContain('mongoose');

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['dev-db']).toBeTruthy();
    expect(config.targets['serve'].dependsOn).toContain('dev-db');
    expect(config.targets['db:generate']).toBeFalsy();
  }, 60000);

  it('does not scaffold database files when database is none', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, { ...options, database: 'none' });

    expect(host.exists('apps/test/prisma/schema.prisma')).toBeFalsy();
    expect(host.exists('apps/test/src/database.ts')).toBeFalsy();
    expect(host.exists('apps/test/scripts/dev-db.sh')).toBeFalsy();

    const config = readProjectConfiguration(host, 'test');
    expect(config.targets['dev-db']).toBeFalsy();
  }, 60000);
});
