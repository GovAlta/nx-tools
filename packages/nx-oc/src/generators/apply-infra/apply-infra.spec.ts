import { createTree } from '@nx/devkit/testing';
import { mocked } from 'jest-mock';
import generator from './apply-infra';
import { runOcCommand } from '../../utils/oc-utils';
import { writeJson } from '@nx/devkit';

jest.mock('../../utils/oc-utils');
const mockedRunOcCommand = mocked(runOcCommand);

describe('Apply Infra Generator', () => {
  beforeEach(() => {
    mockedRunOcCommand.mockReset();
  });

  it('can run', async () => {
    const host = createTree();
    writeJson(host, '.openshift/environment.infra.yml', {});
    writeJson(host, '.openshift/environment.env.yml', {});

    mockedRunOcCommand.mockReturnValue({ success: true });

    await generator(host);

    expect(mockedRunOcCommand.mock.calls.length).toBe(3);
    expect(mockedRunOcCommand.mock.calls[0][0]).toBe('project');
    expect(mockedRunOcCommand.mock.calls[1][0]).toBe('apply');
    expect(mockedRunOcCommand.mock.calls[2][0]).toBe('apply');
  });
});
