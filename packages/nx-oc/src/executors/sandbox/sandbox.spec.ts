import { ExecutorContext, logger } from '@nx/devkit';
import runExecutor from './sandbox';
import { SandboxExecutorSchema } from './schema';

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execSync: jest.fn(),
}));
jest.mock('../../utils/oc-utils', () => ({ ensureOcLogin: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execSync } = require('child_process') as { execSync: jest.Mock };

const IMAGE_REF = 'ghcr.io/test-org/test-sandbox-test:sandbox';

function context(tags: string[] = []): ExecutorContext {
  return {
    root: '/ws',
    cwd: '/ws',
    isVerbose: false,
    projectName: 'test',
    projectsConfigurations: {
      version: 2,
      projects: {
        test: { root: 'apps/test', tags },
      },
    },
  } as unknown as ExecutorContext;
}

const baseOptions: SandboxExecutorSchema = {
  sandboxProject: 'test-sandbox',
  registry: 'ghcr.io/test-org',
  appType: 'node',
};

// The commands passed to execSync, in call order.
function commands(): string[] {
  return execSync.mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  execSync.mockReset();
  execSync.mockImplementation(() => Buffer.from(''));
});

describe('sandbox executor', () => {
  it('builds, pushes, tags, imports, and rolls out in order', async () => {
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(true);

    const cmds = commands();
    const has = (s: string) => cmds.some((c) => c.includes(s));
    expect(has('nx build test --configuration production')).toBe(true);
    expect(
      has(
        `podman build --platform=linux/amd64 -f .openshift/test/Dockerfile -t ${IMAGE_REF} .`,
      ),
    ).toBe(true);
    expect(has(`podman push ${IMAGE_REF}`)).toBe(true);
    expect(
      has(
        `oc tag ${IMAGE_REF} test:sandbox --reference-policy=local -n test-sandbox`,
      ),
    ).toBe(true);
    expect(has('oc import-image test:sandbox --confirm -n test-sandbox')).toBe(
      true,
    );
    expect(has('oc create secret docker-registry ghcr-pull')).toBe(true);
    // GITHUB_ACTOR (set by the Actions runner) must take priority over `gh api
    // user -q .login`, which 403s for a GitHub App/installation token — the
    // registry login and the pull secret both need this fallback to work in CI.
    const registryLogin = cmds.find((c) => c.includes('podman login'));
    const pullSecret = cmds.find((c) =>
      c.includes('oc create secret docker-registry ghcr-pull'),
    );
    expect(registryLogin).toContain(
      '-u "${GITHUB_ACTOR:-$(gh api user -q .login)}"',
    );
    expect(pullSecret).toContain(
      '--docker-username="${GITHUB_ACTOR:-$(gh api user -q .login)}"',
    );
    expect(
      has(
        'oc process -f .openshift/test/test.sandbox.yml -p PROJECT=test-sandbox',
      ),
    ).toBe(true);
    expect(has('oc rollout restart deployment/test -n test-sandbox')).toBe(
      true,
    );
    expect(has('oc rollout status deployment/test -n test-sandbox')).toBe(true);

    // ordering: build precedes push precedes tag precedes import precedes rollout
    const idx = (s: string) => cmds.findIndex((c) => c.includes(s));
    expect(idx('podman build')).toBeLessThan(idx('podman push'));
    expect(idx('podman push')).toBeLessThan(idx('oc tag'));
    expect(idx('oc tag')).toBeLessThan(idx('oc import-image'));
    expect(idx('oc import-image')).toBeLessThan(idx('oc rollout restart'));
  });

  it('mirrors CLIENT_SECRET for a node service only, read from .env.local', async () => {
    await runExecutor(baseOptions, context());
    expect(
      commands().some(
        (c) =>
          c.includes('oc create secret generic test-secrets') &&
          c.includes('CLIENT_SECRET') &&
          // CLIENT_SECRET lives in .env.local, not .env - @abgov/nx-adsp's
          // express-service writes it there, not to .env.
          c.includes('.env.local'),
      ),
    ).toBe(true);

    execSync.mockClear();
    await runExecutor({ ...baseOptions, appType: 'frontend' }, context());
    expect(commands().some((c) => c.includes('test-secrets'))).toBe(false);
  });

  it('fails fast with an actionable message when podman is missing', async () => {
    execSync.mockImplementation((cmd: string) => {
      if (cmd.startsWith('command -v podman')) throw new Error('not found');
      return Buffer.from('');
    });
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(false);
    // did not proceed to the build
    expect(commands().some((c) => c.includes('podman build'))).toBe(false);
  });

  it('fails fast when the podman machine is not running', async () => {
    execSync.mockImplementation((cmd: string) => {
      if (cmd === 'podman info') throw new Error('cannot connect');
      return Buffer.from('');
    });
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(false);
    expect(commands().some((c) => c.includes('podman build'))).toBe(false);
  });

  it('fails fast when gh is installed but not authenticated (before the build)', async () => {
    execSync.mockImplementation((cmd: string) => {
      if (cmd === 'gh auth status 2>&1') throw new Error('not logged in');
      return Buffer.from('');
    });
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(false);
    // gh checked up front — no build/push happened
    expect(commands().some((c) => c.includes('nx build test'))).toBe(false);
    expect(commands().some((c) => c.includes('podman build'))).toBe(false);
  });

  it('fails fast, before the build, when the active gh account is missing write:packages', async () => {
    const status = `github.com
  ✓ Logged in to github.com account someone (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo'
`;
    execSync.mockImplementation((cmd: string) => {
      if (cmd === 'gh auth status 2>&1') return Buffer.from(status);
      return Buffer.from('');
    });
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(false);
    expect(commands().some((c) => c.includes('nx build test'))).toBe(false);
    expect(commands().some((c) => c.includes('podman build'))).toBe(false);
  });

  it('proceeds when the active gh account has write:packages, even if another logged-in account does not', async () => {
    const status = `github.com
  ✓ Logged in to github.com account other-account (keyring)
  - Active account: false
  - Token scopes: 'gist', 'read:org', 'repo'

  ✓ Logged in to github.com account active-account (keyring)
  - Active account: true
  - Token scopes: 'delete:packages', 'gist', 'read:org', 'repo', 'write:packages'
`;
    execSync.mockImplementation((cmd: string) => {
      if (cmd === 'gh auth status 2>&1') return Buffer.from(status);
      return Buffer.from('');
    });
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(true);
    expect(commands().some((c) => c.includes('podman build'))).toBe(true);
  });

  it('warns (without failing) when the active gh account has write:packages but not delete:packages', async () => {
    const status = `github.com
  ✓ Logged in to github.com account active-account (keyring)
  - Active account: true
  - Token scopes: 'gist', 'read:org', 'repo', 'write:packages'
`;
    execSync.mockImplementation((cmd: string) => {
      if (cmd === 'gh auth status 2>&1') return Buffer.from(status);
      return Buffer.from('');
    });
    const warnSpy = jest
      .spyOn(logger, 'warn')
      .mockImplementation(() => undefined);
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(true);
    expect(commands().some((c) => c.includes('podman build'))).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('delete:packages'),
    );
    warnSpy.mockRestore();
  });

  it('does not warn when the active gh account has both write:packages and delete:packages', async () => {
    const status = `github.com
  ✓ Logged in to github.com account active-account (keyring)
  - Active account: true
  - Token scopes: 'delete:packages', 'gist', 'read:org', 'repo', 'write:packages'
`;
    execSync.mockImplementation((cmd: string) => {
      if (cmd === 'gh auth status 2>&1') return Buffer.from(status);
      return Buffer.from('');
    });
    const warnSpy = jest
      .spyOn(logger, 'warn')
      .mockImplementation(() => undefined);
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('retries oc import-image on the tag-reconcile race', async () => {
    let importAttempts = 0;
    execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('oc import-image')) {
        importAttempts++;
        if (importAttempts < 3)
          throw new Error('409 the object has been modified');
      }
      return Buffer.from('');
    });
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(true);
    expect(importAttempts).toBe(3);
  });

  it('gives up after importRetries and fails', async () => {
    execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('oc import-image')) throw new Error('409');
      return Buffer.from('');
    });
    const result = await runExecutor(
      { ...baseOptions, importRetries: 2 },
      context(),
    );
    expect(result.success).toBe(false);
    const importCalls = commands().filter((c) => c.includes('oc import-image'));
    expect(importCalls.length).toBe(2);
  });

  it('skipBuild/skipPush reuse the existing image', async () => {
    await runExecutor(
      { ...baseOptions, skipBuild: true, skipPush: true },
      context(),
    );
    const cmds = commands();
    expect(cmds.some((c) => c.includes('podman build'))).toBe(false);
    expect(cmds.some((c) => c.includes('nx build test'))).toBe(false);
    expect(cmds.some((c) => c.includes('podman push'))).toBe(false);
    // still imports + rolls out
    expect(cmds.some((c) => c.includes('oc import-image'))).toBe(true);
    expect(cmds.some((c) => c.includes('oc rollout restart'))).toBe(true);
  });

  describe('database: postgres', () => {
    it('uses the CNPG operator path when the CRD is present', async () => {
      execSync.mockImplementation((cmd: string) => {
        if (cmd.includes('oc get crd ')) {
          return Buffer.from('clusters.postgresql.cnpg.io  2025-01-01T00:00:00Z');
        }
        return Buffer.from('');
      });

      const result = await runExecutor(
        { ...baseOptions, database: 'postgres' },
        context(),
      );
      expect(result.success).toBe(true);

      const cmds = commands();
      expect(
        cmds.some((c) =>
          c.includes('add-scc-to-user restricted-v2 -z sandbox-postgres'),
        ),
      ).toBe(true);
      expect(cmds.some((c) => c.includes('sandbox-postgres-cnpg.yml'))).toBe(
        true,
      );
      expect(
        cmds.some((c) =>
          c.includes('clusters.postgresql.cnpg.io/sandbox-postgres'),
        ),
      ).toBe(true);
      expect(cmds.some((c) => c.includes('test-db.yml'))).toBe(true);
      // No plain Deployment provisioning or shim resources
      expect(cmds.some((c) => c.includes('sandbox-postgres-creds'))).toBe(false);
      expect(cmds.some((c) => c.includes('sandbox-postgres.yml'))).toBe(false);
      // Database CR applied before the app rollout
      const dbCrIdx = cmds.findIndex((c) => c.includes('test-db.yml'));
      const rolloutIdx = cmds.findIndex((c) =>
        c.includes('rollout status deployment/test'),
      );
      expect(dbCrIdx).toBeGreaterThanOrEqual(0);
      expect(dbCrIdx).toBeLessThan(rolloutIdx);
      // SCC grant precedes Cluster apply
      const sccIdx = cmds.findIndex((c) => c.includes('add-scc-to-user'));
      const clusterIdx = cmds.findIndex((c) =>
        c.includes('sandbox-postgres-cnpg.yml'),
      );
      expect(sccIdx).toBeLessThan(clusterIdx);
    });

    it('falls back to plain Postgres Deployment when CRD and cluster are both absent', async () => {
      const warn = jest
        .spyOn(logger, 'warn')
        .mockImplementation(() => undefined);
      // default mock returns '' for all commands → no CRD, no existing cluster

      const result = await runExecutor(
        { ...baseOptions, database: 'postgres' },
        context(),
      );
      expect(result.success).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('CloudNativePG'),
      );

      const cmds = commands();
      expect(cmds.some((c) => c.includes('sandbox-postgres-creds'))).toBe(true);
      expect(cmds.some((c) => c.includes('sandbox-postgres.yml'))).toBe(true);
      expect(
        cmds.some((c) => c.includes('createdb -U postgres test_sandbox')),
      ).toBe(true);
      // Compatibility shims created so the CNPG-format manifest works
      expect(cmds.some((c) => c.includes('sandbox-postgres-app'))).toBe(true);
      expect(cmds.some((c) => c.includes('sandbox-postgres-rw'))).toBe(true);
      // No CNPG-specific provisioning commands
      expect(cmds.some((c) => c.includes('add-scc-to-user'))).toBe(false);
      expect(
        cmds.some((c) => c.includes('sandbox-postgres-cnpg.yml')),
      ).toBe(false);

      warn.mockRestore();
    });

    it('fails fast when a CNPG Cluster exists but the operator CRD is absent', async () => {
      execSync.mockImplementation((cmd: string) => {
        if (cmd.includes('oc get crd ')) return Buffer.from(''); // operator down
        if (cmd.includes('clusters.postgresql.cnpg.io sandbox-postgres')) {
          return Buffer.from('sandbox-postgres  Cluster  Healthy'); // cluster exists
        }
        return Buffer.from('');
      });

      const result = await runExecutor(
        { ...baseOptions, database: 'postgres' },
        context(),
      );
      expect(result.success).toBe(false);
      // Neither CNPG provisioning nor plain Deployment fallback attempted
      expect(commands().some((c) => c.includes('sandbox-postgres.yml'))).toBe(
        false,
      );
      expect(commands().some((c) => c.includes('add-scc-to-user'))).toBe(false);
    });

    it('fails fast when azure-disk quota is full', async () => {
      execSync.mockImplementation((cmd: string) => {
        if (cmd.includes('oc get crd ')) {
          return Buffer.from('clusters.postgresql.cnpg.io  2025-01-01T00:00:00Z');
        }
        if (
          cmd.includes('oc describe resourcequota') &&
          cmd.includes('grep')
        ) {
          return Buffer.from(
            'azure-disk.storageclass.storage.k8s.io/requests.storage  10Gi  10Gi',
          );
        }
        return Buffer.from('');
      });

      const result = await runExecutor(
        { ...baseOptions, database: 'postgres' },
        context(),
      );
      expect(result.success).toBe(false);
      expect(commands().some((c) => c.includes('add-scc-to-user'))).toBe(false);
    });
  });

  it('ensures paired backend Services from proxy-service tags (idempotent)', async () => {
    await runExecutor(
      { ...baseOptions, appType: 'frontend' },
      context(['adsp:proxy-service:test-service:3333']),
    );
    const guard = commands().find((c) =>
      c.includes('oc get service test-service'),
    );
    expect(guard).toBeTruthy();
    expect(guard).toContain('||');
    expect(guard).toContain(
      'oc create service clusterip test-service --tcp=3333:3333',
    );
  });

  it('adds no paired-service guard without proxy-service tags', async () => {
    await runExecutor(baseOptions, context());
    expect(commands().some((c) => c.includes('oc get service'))).toBe(false);
  });

  it('warns when a paired backend has no running pods', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    // default mock returns '' for `oc get endpoints` → no endpoints
    await runExecutor(
      { ...baseOptions, appType: 'frontend' },
      context(['adsp:proxy-service:test-service:3333']),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('test-service'));
    // warn only — does not deploy the backend
    expect(
      commands().some((c) => c.includes('nx run test-service:sandbox')),
    ).toBe(false);
    warn.mockRestore();
  });

  it('does not warn when the paired backend has endpoints', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    execSync.mockImplementation((cmd: string) =>
      Buffer.from(
        cmd.includes('oc get endpoints test-service') ? '10.1.2.3' : '',
      ),
    );
    await runExecutor(
      { ...baseOptions, appType: 'frontend' },
      context(['adsp:proxy-service:test-service:3333']),
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('deployBackend deploys each paired backend first (no warning)', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await runExecutor(
      { ...baseOptions, appType: 'frontend', deployBackend: true },
      context(['adsp:proxy-service:test-service:3333']),
    );
    expect(
      commands().some((c) => c.includes('npx nx run test-service:sandbox')),
    ).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
