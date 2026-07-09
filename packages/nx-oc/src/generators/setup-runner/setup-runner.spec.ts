import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import * as ocUtils from '../../utils/oc-utils';
import * as ghUtils from '../../utils/gh-utils';
import * as gitUtils from '../../utils/git-utils';
import { Schema } from './schema';
import generator from './setup-runner';

jest.mock('../../utils/oc-utils');
jest.mock('../../utils/gh-utils');
jest.mock('../../utils/git-utils');

const ocMock = ocUtils as jest.Mocked<typeof ocUtils>;
const ghMock = ghUtils as jest.Mocked<typeof ghUtils>;
const gitMock = gitUtils as jest.Mocked<typeof gitUtils>;

const MANIFEST = '.openshift/github-runner/deployment.yml';

describe('Setup Runner Generator', () => {
  const options: Schema = { infra: 'my-infra' };

  function withManifest() {
    const host = createTreeWithEmptyWorkspace();
    host.write(MANIFEST, 'kind: Deployment\n');
    return host;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    ocMock.ensureOcLogin.mockImplementation(() => undefined);
    ocMock.createGenericSecret.mockReturnValue(true);
    ocMock.runOcCommand.mockReturnValue({ success: true });
    ocMock.rolloutRestartDeployment.mockReturnValue(true);
    ghMock.checkGhCli.mockImplementation(() => undefined);
    ghMock.setGhVariable.mockReturnValue(true);
    ghMock.promptForGitHubPat.mockResolvedValue('test-pat');
    gitMock.getGitRemoteUrl.mockReturnValue('https://github.com/GovAlta/nx-tools.git');
    gitMock.getGitHubRepo.mockReturnValue('GovAlta/nx-tools');
  });

  it('creates the secret, applies the Deployment, and enables RUN_E2E', async () => {
    const host = withManifest();
    await generator(host, options);

    expect(ocMock.createGenericSecret).toHaveBeenCalledWith(
      'github-runner-pat', { pat: 'test-pat' }, 'my-infra'
    );
    expect(ocMock.runOcCommand).toHaveBeenCalledWith('apply', [], expect.anything());
    expect(ocMock.rolloutRestartDeployment).toHaveBeenCalledWith('github-runner-playwright', 'my-infra');
    expect(ghMock.setGhVariable).toHaveBeenCalledWith('RUN_E2E', 'true', 'GovAlta/nx-tools');
  });

  it('reuses a PAT passed in by the caller without prompting', async () => {
    const host = withManifest();
    await generator(host, { ...options, pat: 'passed-in-pat' });

    expect(ghMock.promptForGitHubPat).not.toHaveBeenCalled();
    expect(ocMock.createGenericSecret).toHaveBeenCalledWith(
      'github-runner-pat', { pat: 'passed-in-pat' }, 'my-infra'
    );
  });

  it('prompts for a PAT when one is not passed in', async () => {
    const host = withManifest();
    await generator(host, options);
    expect(ghMock.promptForGitHubPat).toHaveBeenCalled();
  });

  it('does nothing when the runner manifest is absent', async () => {
    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);

    expect(ocMock.ensureOcLogin).not.toHaveBeenCalled();
    expect(ocMock.createGenericSecret).not.toHaveBeenCalled();
    expect(ghMock.setGhVariable).not.toHaveBeenCalled();
  });

  it('skips when no GitHub remote is found', async () => {
    gitMock.getGitRemoteUrl.mockReturnValue(undefined);
    gitMock.getGitHubRepo.mockReturnValue(undefined);

    const host = withManifest();
    await generator(host, options);

    expect(ocMock.createGenericSecret).not.toHaveBeenCalled();
    expect(ghMock.setGhVariable).not.toHaveBeenCalled();
  });

  it('does not enable RUN_E2E when applying the Deployment fails', async () => {
    ocMock.runOcCommand.mockReturnValue({ success: false });

    const host = withManifest();
    await generator(host, options);

    expect(ghMock.setGhVariable).not.toHaveBeenCalled();
  });
});
