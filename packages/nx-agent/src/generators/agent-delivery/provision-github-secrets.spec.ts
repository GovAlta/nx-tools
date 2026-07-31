import { addProjectConfiguration, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { provisionGithubActionsSecrets } from './provision-github-secrets';
import { Schema } from './schema';

// @abgov/nx-oc is lazy-loaded (an optional peer -- see provision-github-secrets.ts's own
// `await import(...)`), so @nx/enforce-module-boundaries forbids a static import of it anywhere
// in this project. Obtain the mocked module the same lazy way instead.
jest.mock('@abgov/nx-oc');
let mocked: jest.Mocked<typeof import('@abgov/nx-oc')>;

const REPO = 'GovAlta/nx-tools';
const BASE: Schema = { githubActions: true, provisionSecrets: true };

function logSpy() {
  return jest.spyOn(console, 'log').mockImplementation(() => undefined);
}

describe('provisionGithubActionsSecrets', () => {
  let host: Tree;

  beforeEach(async () => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    jest.resetAllMocks();
    mocked = (await import('@abgov/nx-oc')) as jest.Mocked<
      typeof import('@abgov/nx-oc')
    >;

    mocked.isNonInteractive.mockReturnValue(false);
    mocked.isOcLoggedIn.mockReturnValue(false);
    mocked.getGitRemoteUrl.mockReturnValue('git@github.com:GovAlta/nx-tools.git');
    mocked.getGitHubRepo.mockReturnValue(REPO);
    mocked.checkGhCli.mockImplementation(() => undefined);
    mocked.listGhSecretNames.mockReturnValue([]);
    mocked.listGhVariableNames.mockReturnValue([]);
    mocked.setGhSecret.mockReturnValue(true);
    mocked.setGhVariable.mockReturnValue(true);
  });

  it('no-ops entirely when provisionSecrets is not set', async () => {
    await provisionGithubActionsSecrets(host, { githubActions: true });
    expect(mocked.checkGhCli).not.toHaveBeenCalled();
    expect(mocked.isOcLoggedIn).not.toHaveBeenCalled();
  });

  it('warns and does nothing when githubActions is not set', async () => {
    const log = logSpy();
    await provisionGithubActionsSecrets(host, { provisionSecrets: true });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('no effect without --githubActions'),
    );
    expect(mocked.checkGhCli).not.toHaveBeenCalled();
  });

  it('uses every explicit value verbatim, attempting zero derivation calls', async () => {
    logSpy();
    await provisionGithubActionsSecrets(host, {
      ...BASE,
      openshiftServer: 'https://api.example.com:6443',
      openshiftToken: 'tok',
      openshiftNamespace: 'my-ns',
      adspEnv: 'dev',
      adspTenantName: 'my-tenant',
      adspTenantRealm: 'my-realm',
      adspClientSecret: 'shh',
      maxIterations: 6,
    });

    expect(mocked.isOcLoggedIn).not.toHaveBeenCalled();
    expect(mocked.getOcServerUrl).not.toHaveBeenCalled();
    expect(mocked.getSaToken).not.toHaveBeenCalled();
    expect(mocked.detectAdspEnv).not.toHaveBeenCalled();
    expect(mocked.detectAdspTenant).not.toHaveBeenCalled();
    expect(mocked.getAdspConfiguration).not.toHaveBeenCalled();
    expect(mocked.getAdspCliCiStatus).not.toHaveBeenCalled();

    expect(mocked.setGhSecret).toHaveBeenCalledWith(
      'OPENSHIFT_SERVER',
      'https://api.example.com:6443',
      REPO,
    );
    expect(mocked.setGhSecret).toHaveBeenCalledWith('OPENSHIFT_TOKEN', 'tok', REPO);
    expect(mocked.setGhVariable).toHaveBeenCalledWith(
      'OPENSHIFT_NAMESPACE',
      'my-ns',
      REPO,
    );
    expect(mocked.setGhVariable).toHaveBeenCalledWith('ADSP_ENV', 'dev', REPO);
    expect(mocked.setGhVariable).toHaveBeenCalledWith(
      'ADSP_TENANT_NAME',
      'my-tenant',
      REPO,
    );
    expect(mocked.setGhVariable).toHaveBeenCalledWith(
      'ADSP_TENANT_REALM',
      'my-realm',
      REPO,
    );
    expect(mocked.setGhSecret).toHaveBeenCalledWith(
      'ADSP_CLIENT_SECRET',
      'shh',
      REPO,
    );
    expect(mocked.setGhSecret).toHaveBeenCalledWith(
      'ADSP_CLIENT_ID',
      'adsp-cli-ci',
      REPO,
    );
    expect(mocked.setGhVariable).toHaveBeenCalledWith('MAX_ITERATIONS', '6', REPO);
  });

  it('derives every project-backed value from an already-generated project', async () => {
    logSpy();
    addProjectConfiguration(host, 'my-app', {
      root: 'apps/my-app',
      tags: ['adsp:scaffold-env:dev', 'adsp:scaffold-tenant:my-tenant'],
      targets: { sandbox: { executor: '@abgov/nx-oc:sandbox', options: { sandboxProject: 'my-ns' } } },
    });
    mocked.detectAdspEnv.mockReturnValue('dev');
    mocked.detectAdspTenant.mockReturnValue('my-tenant');
    mocked.isOcLoggedIn.mockReturnValue(true);
    mocked.getOcServerUrl.mockReturnValue('https://api.example.com:6443');
    mocked.getSaToken.mockReturnValue('sa-tok');
    mocked.getAdspConfiguration.mockResolvedValue({
      tenant: 'my-tenant',
      tenantRealm: 'realm-abc',
      accessServiceUrl: 'https://access.example.com',
      directoryServiceUrl: 'https://directory.example.com',
      accessToken: 'admin-tok',
    });
    mocked.getAdspCliCiStatus.mockResolvedValue({
      found: true,
      enabled: true,
      secret: 'client-secret',
    });

    await provisionGithubActionsSecrets(host, BASE);

    expect(mocked.setGhVariable).toHaveBeenCalledWith('OPENSHIFT_NAMESPACE', 'my-ns', REPO);
    expect(mocked.setGhSecret).toHaveBeenCalledWith('OPENSHIFT_TOKEN', 'sa-tok', REPO);
    expect(mocked.setGhVariable).toHaveBeenCalledWith('ADSP_ENV', 'dev', REPO);
    expect(mocked.setGhVariable).toHaveBeenCalledWith('ADSP_TENANT_NAME', 'my-tenant', REPO);
    expect(mocked.setGhVariable).toHaveBeenCalledWith('ADSP_TENANT_REALM', 'realm-abc', REPO);
    expect(mocked.setGhSecret).toHaveBeenCalledWith('ADSP_CLIENT_SECRET', 'client-secret', REPO);
    expect(mocked.getSaToken).toHaveBeenCalledWith('github-actions', 'my-ns');
  });

  it('resolves ADSP_ENV/ADSP_TENANT_NAME from tags even with no sandbox target yet — the decoupled-scan / ordering case', async () => {
    logSpy();
    addProjectConfiguration(host, 'my-app', {
      root: 'apps/my-app',
      tags: ['adsp:scaffold-env:dev', 'adsp:scaffold-tenant:my-tenant'],
    });
    mocked.detectAdspEnv.mockReturnValue('dev');
    mocked.detectAdspTenant.mockReturnValue('my-tenant');

    await provisionGithubActionsSecrets(host, BASE);

    expect(mocked.setGhVariable).toHaveBeenCalledWith('ADSP_ENV', 'dev', REPO);
    expect(mocked.setGhVariable).toHaveBeenCalledWith('ADSP_TENANT_NAME', 'my-tenant', REPO);
    // Namespace has no sandbox target anywhere yet -- cascades to undetermined, not a throw.
    expect(mocked.setGhVariable).not.toHaveBeenCalledWith(
      'OPENSHIFT_NAMESPACE',
      expect.anything(),
      REPO,
    );
    expect(mocked.getSaToken).not.toHaveBeenCalled();
  });

  it('never throws in a workspace with zero projects, and reports everything project-derived as undetermined', async () => {
    const log = logSpy();

    await expect(provisionGithubActionsSecrets(host, BASE)).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('OPENSHIFT_NAMESPACE'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ADSP_ENV'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ADSP_TENANT_NAME'));
    expect(mocked.setGhVariable).not.toHaveBeenCalledWith(
      'OPENSHIFT_NAMESPACE',
      expect.anything(),
      REPO,
    );
  });

  it('reports an ambiguous OPENSHIFT_NAMESPACE across two projects with differing sandboxProject values, naming both', async () => {
    const log = logSpy();
    addProjectConfiguration(host, 'app-a', {
      root: 'apps/app-a',
      targets: { sandbox: { executor: '@abgov/nx-oc:sandbox', options: { sandboxProject: 'ns-a' } } },
    });
    addProjectConfiguration(host, 'app-b', {
      root: 'apps/app-b',
      targets: { sandbox: { executor: '@abgov/nx-oc:sandbox', options: { sandboxProject: 'ns-b' } } },
    });

    await provisionGithubActionsSecrets(host, BASE);

    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/OPENSHIFT_NAMESPACE.*ambiguous.*ns-a.*app-a.*ns-b.*app-b|OPENSHIFT_NAMESPACE.*ambiguous.*ns-b.*app-b.*ns-a.*app-a/),
    );
    expect(mocked.setGhVariable).not.toHaveBeenCalledWith(
      'OPENSHIFT_NAMESPACE',
      expect.anything(),
      REPO,
    );
  });

  it('scopes derivation to --project when given, even if a different project has the value', async () => {
    logSpy();
    addProjectConfiguration(host, 'app-a', {
      root: 'apps/app-a',
      targets: { sandbox: { executor: '@abgov/nx-oc:sandbox', options: { sandboxProject: 'ns-a' } } },
    });
    addProjectConfiguration(host, 'app-b', { root: 'apps/app-b' });

    await provisionGithubActionsSecrets(host, { ...BASE, project: 'app-b' });

    expect(mocked.setGhVariable).not.toHaveBeenCalledWith(
      'OPENSHIFT_NAMESPACE',
      expect.anything(),
      REPO,
    );
  });

  it('reports the exact manual-enable warning when adsp-cli-ci is disabled, and never attempts to enable it', async () => {
    const log = logSpy();
    addProjectConfiguration(host, 'my-app', {
      root: 'apps/my-app',
      tags: ['adsp:scaffold-env:dev', 'adsp:scaffold-tenant:my-tenant'],
    });
    mocked.detectAdspEnv.mockReturnValue('dev');
    mocked.detectAdspTenant.mockReturnValue('my-tenant');
    mocked.getAdspConfiguration.mockResolvedValue({
      tenant: 'my-tenant',
      tenantRealm: 'realm-abc',
      accessServiceUrl: 'https://access.example.com',
      directoryServiceUrl: 'https://directory.example.com',
      accessToken: 'admin-tok',
    });
    mocked.getAdspCliCiStatus.mockResolvedValue({ found: true, enabled: false });

    await provisionGithubActionsSecrets(host, BASE);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        "the tenant's adsp-cli-ci Keycloak client is disabled",
      ),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('--adspClientSecret'));
    expect(mocked.setGhSecret).not.toHaveBeenCalledWith(
      'ADSP_CLIENT_SECRET',
      expect.anything(),
      REPO,
    );
  });

  it('never hangs or prompts in non-interactive mode with nothing cached -- everything ends up undetermined with a real reason', async () => {
    const log = logSpy();
    mocked.isNonInteractive.mockReturnValue(true);
    mocked.isOcLoggedIn.mockReturnValue(false);
    mocked.getAdspConfiguration.mockRejectedValue(
      new Error('Not signed in to ADSP (non-interactive run). Sign in first with:\n  ...'),
    );
    addProjectConfiguration(host, 'my-app', {
      root: 'apps/my-app',
      tags: ['adsp:scaffold-env:dev', 'adsp:scaffold-tenant:my-tenant'],
    });
    mocked.detectAdspEnv.mockReturnValue('dev');
    mocked.detectAdspTenant.mockReturnValue('my-tenant');

    await provisionGithubActionsSecrets(host, BASE);

    expect(mocked.ensureOcLogin).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('OPENSHIFT_SERVER'));
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Not signed in to ADSP'),
    );
  });

  it('reports Phase 1 results but skips every write when gh is unauthenticated', async () => {
    const log = logSpy();
    mocked.checkGhCli.mockImplementation(() => {
      throw new Error('gh CLI is not installed or not authenticated.');
    });

    await provisionGithubActionsSecrets(host, {
      ...BASE,
      openshiftServer: 'https://api.example.com:6443',
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('gh CLI is not installed'),
    );
    expect(mocked.setGhSecret).not.toHaveBeenCalled();
    expect(mocked.setGhVariable).not.toHaveBeenCalled();
  });

  it('never overwrites a secret/variable that already exists on the repo by default', async () => {
    logSpy();
    mocked.listGhSecretNames.mockReturnValue(['OPENSHIFT_SERVER']);
    mocked.listGhVariableNames.mockReturnValue(['OPENSHIFT_NAMESPACE']);

    await provisionGithubActionsSecrets(host, {
      ...BASE,
      openshiftServer: 'https://api.example.com:6443',
      openshiftNamespace: 'my-ns',
    });

    expect(mocked.setGhSecret).not.toHaveBeenCalledWith(
      'OPENSHIFT_SERVER',
      expect.anything(),
      REPO,
    );
    expect(mocked.setGhVariable).not.toHaveBeenCalledWith(
      'OPENSHIFT_NAMESPACE',
      expect.anything(),
      REPO,
    );
  });

  it('overwrites an already-existing value only when --overwriteExisting is passed', async () => {
    logSpy();
    mocked.listGhSecretNames.mockReturnValue(['OPENSHIFT_SERVER']);

    await provisionGithubActionsSecrets(host, {
      ...BASE,
      openshiftServer: 'https://api.example.com:6443',
      overwriteExisting: true,
    });

    expect(mocked.setGhSecret).toHaveBeenCalledWith(
      'OPENSHIFT_SERVER',
      'https://api.example.com:6443',
      REPO,
    );
  });
});
