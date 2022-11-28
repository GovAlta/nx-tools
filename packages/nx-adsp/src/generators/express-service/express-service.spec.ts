import { readProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyV1Workspace } from '@nrwl/devkit/testing';

import * as utils from '../../utils/adsp-utils';
import { environments } from '../../utils/environments';
import { Schema } from './schema';
import generator from './express-service';

jest.mock('../../utils/adsp-utils');
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});

describe('Express Service Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyV1Workspace();
    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/src/main.ts')).toBeTruthy();
  });
});
