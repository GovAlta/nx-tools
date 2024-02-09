import * as utils from '@abgov/nx-oc';
import { addProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import axios from 'axios';
import { prompt } from 'enquirer';

import { Schema } from './schema';
import generator from './react-task-list';
import { QueueDefinition } from '../../utils/task';

const queueDefinition: QueueDefinition = {
  namespace: 'test',
  name: 'run-test',
  assignerRoles: ['test-assigner'],
  workerRoles: ['test-worker'],
};

jest.mock('@abgov/nx-oc');
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getServiceUrls.mockResolvedValue({
  'urn:ads:platform:tenant-service:v2': 'https://tenant-service/tenant/v2',
  'urn:ads:platform:configuration-service': 'https://configuration-service',
});

utilsMock.realmLogin.mockResolvedValue('token');
utilsMock.selectTenant.mockResolvedValue({ name: 'demo', realm: 'demo' });

jest.mock('axios');
const axiosMock = axios as jest.Mocked<typeof axios>;
axiosMock.get.mockResolvedValueOnce({
  data: { configuration: { queues: { 'test:run-test': queueDefinition } } },
});
axiosMock.patch.mockResolvedValueOnce({
  data: { 'test:run-test': queueDefinition },
});

jest.mock('enquirer', () => ({ prompt: jest.fn() }));
const promptMock = prompt as jest.Mock;
promptMock
  .mockResolvedValueOnce({ definition: 'test:run-test' })
  .mockResolvedValueOnce({ addStream: true });

describe('React Task List Generator', () => {
  const options: Schema = {
    project: 'test',
    env: 'dev',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });

    addProjectConfiguration(host, 'test', {
      root: 'apps/test',
      projectType: 'application',
      targets: {
        build: {
          executor: '@nx/web:webpack',
        },
      },
    });

    await generator(host, options);
    expect(host.exists('apps/test/src/app/run-test/run-test.tsx')).toBeTruthy();
    expect(
      host.exists('apps/test/src/app/run-test/run-test.slice.ts')
    ).toBeTruthy();
    expect(
      host.exists('apps/test/src/app/run-test/run-test.module.css')
    ).toBeTruthy();
  }, 30000);
});
