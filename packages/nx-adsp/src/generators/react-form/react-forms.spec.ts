import * as utils from '@abgov/nx-oc';
import { addProjectConfiguration } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import axios from 'axios';
import { prompt } from 'enquirer';

import { FormDefinition } from '../../utils/form';
import { Schema } from './schema';
import generator from './react-form';

const formDefinition: FormDefinition = {
  id: 'some-intake',
  name: 'Some Intake',
  dataSchema: {
    type: 'object',
    properties: {
      notInSection: {
        type: 'string',
      },
      personalInformation: {
        title: 'Personal information',
        description: '',
        type: 'object',
        properties: {
          firstName: {
            type: 'string',
            pattern: '^.{1,20}$',
          },
          lastName: {
            type: 'string',
          },
        },
        required: ['firstName', 'lastName'],
      },
      additional: {
        description: 'Provide additional information.',
        type: 'object',
        properties: {
          income: {
            type: 'number',
            title: 'Annual income',
            description: 'Annual income from line 4 of Notice of Assessment.',
          },
          consent: {
            type: 'boolean',
          },
        },
      },
    },
  },
  assessorRoles: [],
  applicantRoles: [],
};

jest.mock('@abgov/nx-oc');
const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getServiceUrls.mockResolvedValue({
  'urn:ads:platform:tenant-service:v2': 'https://tenant-service/tenant/v2',
  'urn:ads:platform:form-service': 'https://form-service',
  'urn:ads:platform:configuration-service': 'https://configuration-service',
});

utilsMock.realmLogin.mockResolvedValue('token');
utilsMock.selectTenant.mockResolvedValue({ name: 'demo', realm: 'demo' });

jest.mock('axios');
const axiosMock = axios as jest.Mocked<typeof axios>;
axiosMock.get.mockResolvedValueOnce({
  data: { 'some-intake': formDefinition },
});

jest.mock('enquirer', () => ({ prompt: jest.fn() }));
const promptMock = prompt as jest.Mock;
promptMock.mockResolvedValueOnce({ definition: 'Some Intake' });
promptMock.mockResolvedValueOnce({ addFileType: false });

describe('React Form Generator', () => {
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
          executor: '@nrwl/web:webpack',
        },
      },
    });

    await generator(host, options);
    expect(
      host.exists('apps/test/src/app/some-intake/some-intake.tsx')
    ).toBeTruthy();
    expect(
      host.exists('apps/test/src/app/some-intake/some-intake.slice.ts')
    ).toBeTruthy();
    expect(
      host.exists('apps/test/src/app/some-intake/some-intake.module.css')
    ).toBeTruthy();
  }, 30000);
});
