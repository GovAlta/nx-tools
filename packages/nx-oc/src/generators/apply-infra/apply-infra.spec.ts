import { createTree } from '@nx/devkit/testing';
import { mocked } from 'jest-mock';
import generator from './apply-infra';
import { ensureOcLogin, runOcCommand } from '../../utils/oc-utils';
import { writeJson } from '@nx/devkit';

jest.mock('../../utils/oc-utils');
const mockedEnsureOcLogin = mocked(ensureOcLogin);
const mockedRunOcCommand = mocked(runOcCommand);

describe('Apply Infra Generator', () => {
  beforeEach(() => {
    mockedEnsureOcLogin.mockReset();
    mockedRunOcCommand.mockReset();
  });

  it('can run', async () => {
    const host = createTree();
    writeJson(host, '.openshift/environment.infra.yml', {});
    writeJson(host, '.openshift/environment.env.yml', {});

    mockedRunOcCommand.mockReturnValue({ success: true });

    await generator(host);

    expect(mockedEnsureOcLogin).toHaveBeenCalledTimes(1);
    expect(mockedRunOcCommand.mock.calls.length).toBe(2);
    expect(mockedRunOcCommand.mock.calls[0][0]).toBe('apply');
    expect(mockedRunOcCommand.mock.calls[1][0]).toBe('apply');
  });

  it('logs login error and exits cleanly without running oc apply', async () => {
    const host = createTree();
    mockedEnsureOcLogin.mockImplementation(() => {
      throw new Error('oc CLI is not installed or not on PATH.');
    });

    await generator(host);

    expect(mockedRunOcCommand).not.toHaveBeenCalled();
  });
});
