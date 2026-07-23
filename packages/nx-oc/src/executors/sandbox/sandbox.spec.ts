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
        `podman build --platform=linux/amd64 -f .openshift/test/Dockerfile -t ${IMAGE_REF} .`
      )
    ).toBe(true);
    expect(has(`podman push ${IMAGE_REF}`)).toBe(true);
    expect(
      has(`oc tag ${IMAGE_REF} test:sandbox --reference-policy=local -n test-sandbox`)
    ).toBe(true);
    expect(has('oc import-image test:sandbox --confirm -n test-sandbox')).toBe(true);
    expect(has('oc create secret docker-registry ghcr-pull')).toBe(true);
    expect(has('oc rollout restart deployment/test -n test-sandbox')).toBe(true);
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
          c.includes('.env.local')
      )
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
      if (cmd === 'gh auth status') throw new Error('not logged in');
      return Buffer.from('');
    });
    const result = await runExecutor(baseOptions, context());
    expect(result.success).toBe(false);
    // gh checked up front — no build/push happened
    expect(commands().some((c) => c.includes('nx build test'))).toBe(false);
    expect(commands().some((c) => c.includes('podman build'))).toBe(false);
  });

  it('retries oc import-image on the tag-reconcile race', async () => {
    let importAttempts = 0;
    execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('oc import-image')) {
        importAttempts++;
        if (importAttempts < 3) throw new Error('409 the object has been modified');
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
    const result = await runExecutor({ ...baseOptions, importRetries: 2 }, context());
    expect(result.success).toBe(false);
    const importCalls = commands().filter((c) => c.includes('oc import-image'));
    expect(importCalls.length).toBe(2);
  });

  it('skipBuild/skipPush reuse the existing image', async () => {
    await runExecutor({ ...baseOptions, skipBuild: true, skipPush: true }, context());
    const cmds = commands();
    expect(cmds.some((c) => c.includes('podman build'))).toBe(false);
    expect(cmds.some((c) => c.includes('nx build test'))).toBe(false);
    expect(cmds.some((c) => c.includes('podman push'))).toBe(false);
    // still imports + rolls out
    expect(cmds.some((c) => c.includes('oc import-image'))).toBe(true);
    expect(cmds.some((c) => c.includes('oc rollout restart'))).toBe(true);
  });

  it('provisions Postgres and the per-app database before rollout', async () => {
    await runExecutor({ ...baseOptions, database: 'postgres' }, context());
    const cmds = commands();
    expect(cmds.some((c) => c.includes('sandbox-postgres-creds'))).toBe(true);
    expect(cmds.some((c) => c.includes('sandbox-postgres.yml'))).toBe(true);
    expect(cmds.some((c) => c.includes('createdb -U postgres test_sandbox'))).toBe(true);
    const createDbIdx = cmds.findIndex((c) => c.includes('createdb'));
    const rolloutIdx = cmds.findIndex((c) => c.includes('rollout status deployment/test'));
    expect(createDbIdx).toBeGreaterThanOrEqual(0);
    expect(createDbIdx).toBeLessThan(rolloutIdx);
  });

  it('ensures paired backend Services from proxy-service tags (idempotent)', async () => {
    await runExecutor(
      { ...baseOptions, appType: 'frontend' },
      context(['adsp:proxy-service:test-service:3333'])
    );
    const guard = commands().find((c) => c.includes('oc get service test-service'));
    expect(guard).toBeTruthy();
    expect(guard).toContain('||');
    expect(guard).toContain('oc create service clusterip test-service --tcp=3333:3333');
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
      context(['adsp:proxy-service:test-service:3333'])
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('test-service'));
    // warn only — does not deploy the backend
    expect(commands().some((c) => c.includes('nx run test-service:sandbox'))).toBe(false);
    warn.mockRestore();
  });

  it('does not warn when the paired backend has endpoints', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    execSync.mockImplementation((cmd: string) =>
      Buffer.from(cmd.includes('oc get endpoints test-service') ? '10.1.2.3' : '')
    );
    await runExecutor(
      { ...baseOptions, appType: 'frontend' },
      context(['adsp:proxy-service:test-service:3333'])
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('deployBackend deploys each paired backend first (no warning)', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await runExecutor(
      { ...baseOptions, appType: 'frontend', deployBackend: true },
      context(['adsp:proxy-service:test-service:3333'])
    );
    expect(commands().some((c) => c.includes('npx nx run test-service:sandbox'))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
