import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import * as ocUtils from '../../utils/oc-utils';
import * as ghUtils from '../../utils/gh-utils';
import * as gitUtils from '../../utils/git-utils';
import { Schema } from './schema';
import generator from './setup-secrets';

jest.mock('../../utils/oc-utils');
jest.mock('../../utils/gh-utils');
jest.mock('../../utils/git-utils');
jest.mock('enquirer', () => ({
  prompt: jest.fn().mockResolvedValue({ pat: 'test-pat' }),
}));

const ocMock = ocUtils as jest.Mocked<typeof ocUtils>;
const ghMock = ghUtils as jest.Mocked<typeof ghUtils>;
const gitMock = gitUtils as jest.Mocked<typeof gitUtils>;

describe('Setup Secrets Generator', () => {
  const options: Schema = { infra: 'my-infra' };

  beforeEach(() => {
    jest.clearAllMocks();
    ocMock.ensureOcLogin.mockImplementation(() => undefined);
    ocMock.getOcServerUrl.mockReturnValue('https://api.example.com:6443');
    ocMock.getSaToken.mockReturnValue('test-sa-token');
    ocMock.createDockerRegistrySecret.mockReturnValue(true);
    ocMock.linkSecretToServiceAccount.mockReturnValue(true);
    ghMock.checkGhCli.mockImplementation(() => undefined);
    ghMock.setGhSecret.mockReturnValue(true);
    gitMock.getGitRemoteUrl.mockReturnValue('https://github.com/GovAlta/nx-tools.git');
    gitMock.getGitHubRepo.mockReturnValue('GovAlta/nx-tools');
    gitMock.deriveRegistryFromRemote.mockReturnValue('ghcr.io/GovAlta');
  });

  it('sets GitHub secrets and creates GHCR pull secret', async () => {
    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);

    expect(ghMock.setGhSecret).toHaveBeenCalledWith('OPENSHIFT_SERVER', 'https://api.example.com:6443', 'GovAlta/nx-tools');
    expect(ghMock.setGhSecret).toHaveBeenCalledWith('OPENSHIFT_TOKEN', 'test-sa-token', 'GovAlta/nx-tools');
    expect(ocMock.createDockerRegistrySecret).toHaveBeenCalledWith(
      'ghcr-pull-secret', 'ghcr.io', 'GovAlta', 'test-pat', 'my-infra'
    );
    expect(ocMock.linkSecretToServiceAccount).toHaveBeenCalledWith(
      'ghcr-pull-secret', 'github-actions', 'my-infra'
    );
  });

  it('skips secrets when no GitHub remote is found', async () => {
    gitMock.getGitRemoteUrl.mockReturnValue(undefined);
    gitMock.getGitHubRepo.mockReturnValue(undefined);

    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);

    expect(ghMock.setGhSecret).not.toHaveBeenCalled();
    expect(ocMock.createDockerRegistrySecret).not.toHaveBeenCalled();
  });

  it('skips secrets when gh CLI is not available', async () => {
    ghMock.checkGhCli.mockImplementation(() => { throw new Error('gh: not found'); });

    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);

    expect(ghMock.setGhSecret).not.toHaveBeenCalled();
  });

  it('skips GHCR secret when SA token cannot be retrieved', async () => {
    ocMock.getSaToken.mockReturnValue(undefined);

    const host = createTreeWithEmptyWorkspace();
    await generator(host, options);

    expect(ocMock.createDockerRegistrySecret).toHaveBeenCalled();
  });
});
