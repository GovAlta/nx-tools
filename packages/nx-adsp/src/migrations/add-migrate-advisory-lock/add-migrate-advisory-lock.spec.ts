import { addProjectConfiguration, logger, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import migration from './add-migrate-advisory-lock';

// The real generated file, either side of the fix — not a synthetic
// approximation of it. Turning the first into the second is the migration's
// entire job, so these are the only fixtures that prove anything.
const BEFORE = readFileSync(join(__dirname, 'migrate.before.txt'), 'utf-8');
const AFTER = readFileSync(join(__dirname, 'migrate.after.txt'), 'utf-8');

// The fixtures are the post-formatFiles generated form, so under this
// workspace's own Prettier config the rewrite is byte-exact and the assertions
// below can compare directly.

function addService(host: Tree, name: string, migrateContent?: string): void {
  addProjectConfiguration(host, name, { root: `apps/${name}` });
  if (migrateContent !== undefined) {
    host.write(`apps/${name}/src/migrate.ts`, migrateContent);
  }
}

describe('nx-adsp add-migrate-advisory-lock migration', () => {
  let host: Tree;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rewrites the generated pre-fix runner into the locked version', async () => {
    addService(host, 'api', BEFORE);

    await migration(host);

    expect(host.read('apps/api/src/migrate.ts', 'utf-8')).toEqual(AFTER);
    expect(warn).not.toHaveBeenCalled();
  });

  it('acquires the lock before migrating and releases it in the finally block', async () => {
    addService(host, 'api', BEFORE);

    await migration(host);

    const result = host.read('apps/api/src/migrate.ts', 'utf-8');
    // Ordering is the whole point — a lock taken after migrate() serializes
    // nothing, and one never released strands every later deploy.
    const lockAt = result.indexOf('pg_advisory_lock');
    const migrateAt = result.indexOf('await migrate(');
    const unlockAt = result.indexOf('pg_advisory_unlock');
    const endAt = result.indexOf('await pool.end()');
    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(migrateAt);
    expect(migrateAt).toBeLessThan(unlockAt);
    expect(unlockAt).toBeLessThan(endAt);
    expect(result).toContain('lockClient.release()');
  });

  it('matches through CRLF line endings and trailing whitespace', async () => {
    // git autocrlf and editor settings, not a change to the code.
    addService(
      host,
      'api',
      BEFORE.replace(/\n/g, '\r\n').replace(/\r\n/g, '  \r\n'),
    );

    await migration(host);

    expect(host.read('apps/api/src/migrate.ts', 'utf-8')).toEqual(AFTER);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns rather than rewriting when the file has been reformatted', async () => {
    // A workspace whose Prettier uses a narrower print width wraps the `if`
    // and the migrate() argument list. Semantically the generated file, but not
    // one this migration can positively identify — so it says so instead of
    // guessing. See normalize()'s own comment for why that is the safe
    // direction.
    const reformatted = BEFORE.replace(
      '    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });',
      [
        '    await migrate(drizzle(pool), {',
        '      migrationsFolder: MIGRATIONS_FOLDER,',
        '    });',
      ].join('\n'),
    );
    addService(host, 'api', reformatted);

    await migration(host);

    expect(host.read('apps/api/src/migrate.ts', 'utf-8')).toEqual(reformatted);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('apps/api/src/migrate.ts'),
    );
  });

  it('leaves an already-locked runner byte-identical and silent', async () => {
    addService(host, 'api', AFTER);

    await migration(host);

    expect(host.read('apps/api/src/migrate.ts', 'utf-8')).toEqual(AFTER);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is a no-op on a second run', async () => {
    addService(host, 'api', BEFORE);

    await migration(host);
    const afterFirst = host.read('apps/api/src/migrate.ts', 'utf-8');
    await migration(host);

    expect(host.read('apps/api/src/migrate.ts', 'utf-8')).toEqual(afterFirst);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and leaves a customized runner alone rather than overwriting it', async () => {
    const customized = BEFORE.replace(
      "const MIGRATIONS_FOLDER = 'drizzle';",
      "const MIGRATIONS_FOLDER = 'db/migrations';",
    );
    addService(host, 'api', customized);

    await migration(host);

    expect(host.read('apps/api/src/migrate.ts', 'utf-8')).toEqual(customized);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('apps/api/src/migrate.ts'),
    );
  });

  // Nx surfaces nextSteps in the run summary and hands agentContext to the
  // paired prompt phase, so a skipped file has to reach both — the warning
  // alone is easy to scroll past, and the prompt has nothing to work from
  // without agentContext.
  it('returns the skipped file in both nextSteps and agentContext', async () => {
    const customized = BEFORE.replace(
      "const MIGRATIONS_FOLDER = 'drizzle';",
      "const MIGRATIONS_FOLDER = 'db/migrations';",
    );
    addService(host, 'api', customized);

    const result = await migration(host);

    expect(result).toBeDefined();
    expect(result?.nextSteps).toHaveLength(1);
    expect(result?.nextSteps[0]).toContain('apps/api/src/migrate.ts');
    expect(result?.nextSteps[0]).toContain('pg_advisory_lock');
    expect(result?.agentContext).toEqual([
      expect.stringContaining('apps/api/src/migrate.ts'),
    ]);
  });

  it('returns nothing when every file was rewritten or already correct', async () => {
    addService(host, 'needs-fix', BEFORE);
    addService(host, 'already-ok', AFTER);

    await expect(migration(host)).resolves.toBeUndefined();
  });

  it('names every skipped file, not just the first', async () => {
    const customized = BEFORE.replace('drizzle', 'db/migrations');
    addService(host, 'one', customized);
    addService(host, 'two', customized);

    const result = await migration(host);

    expect(result?.agentContext).toHaveLength(2);
    expect(result?.nextSteps[0]).toContain('apps/one/src/migrate.ts');
    expect(result?.nextSteps[0]).toContain('apps/two/src/migrate.ts');
  });

  it('ignores a migrate.ts that is not drizzle-based, without warning', async () => {
    const unrelated = 'export function migrate() {\n  return null;\n}\n';
    addService(host, 'legacy', unrelated);

    await migration(host);

    expect(host.read('apps/legacy/src/migrate.ts', 'utf-8')).toEqual(unrelated);
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips a project with no migrate.ts (mongo, or no database)', async () => {
    addService(host, 'mongo-svc');

    await expect(migration(host)).resolves.toBeUndefined();
    expect(host.exists('apps/mongo-svc/src/migrate.ts')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('handles a mix of projects in one pass', async () => {
    addService(host, 'needs-fix', BEFORE);
    addService(host, 'already-ok', AFTER);
    addService(host, 'no-db');

    await migration(host);

    expect(host.read('apps/needs-fix/src/migrate.ts', 'utf-8')).toEqual(AFTER);
    expect(host.read('apps/already-ok/src/migrate.ts', 'utf-8')).toEqual(AFTER);
    expect(warn).not.toHaveBeenCalled();
  });
});
