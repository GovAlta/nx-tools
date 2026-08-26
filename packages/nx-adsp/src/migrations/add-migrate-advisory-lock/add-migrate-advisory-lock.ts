import {
  formatFiles,
  getProjects,
  joinPathFragments,
  logger,
  Tree,
} from '@nx/devkit';
import { readFileSync } from 'fs';
import { join } from 'path';

// express-service's generated migration runner, verbatim, either side of the
// advisory-lock fix — as the generator actually emits it, i.e. after
// formatFiles(). That differs from the files-postgres template itself, whose
// .ts__tmpl__ extension Prettier doesn't recognise and so never formats; the
// generated file is what this migration reads and writes, so it's the generated
// file that gets captured here.
//
// Held as fixtures rather than read from the live template because a migration
// has to keep applying the same change forever: sourcing from the template would
// mean a later edit to it silently changed what this already-released migration
// does.
const BEFORE_PATH = join(__dirname, 'migrate.before.txt');
const AFTER_PATH = join(__dirname, 'migrate.after.txt');

const MIGRATE_PATH = 'src/migrate.ts';
const DRIZZLE_MIGRATOR = 'drizzle-orm/node-postgres/migrator';

// What the rewrite must contain to be the rewrite at all. The asset glob in
// project.json is the only thing putting the fixtures in the published package,
// so a mis-scoped glob would otherwise overwrite every matching migrate.ts with
// nothing — checked once, loudly, instead of trusted.
const REQUIRED_MARKERS = [
  'MIGRATION_LOCK_KEY',
  'pg_advisory_lock',
  'pg_advisory_unlock',
  'lockClient.release()',
];

// Compared after normalising only line endings and trailing whitespace — the
// noise git and editors introduce, which cannot hide a meaningful change.
//
// Deliberately NOT a general source normaliser. Tolerating arbitrary
// reformatting is either a half-measure that silently misses cases (collapsing
// whitespace handles a wrapped argument list but not the spaces Prettier puts
// inside the parens of a wrapped `if`, nor the trailing comma it adds) or
// aggressive enough to risk matching a file that isn't the generated one. A
// workspace whose own Prettier reformatted this file gets a warning naming it
// instead — the safe direction, since we only rewrite a file we can positively
// identify. In practice `create-nx-workspace` writes the same
// `{ "singleQuote": true }` config this repo uses, so the generated file is
// byte-identical for all but a deliberately customised setup.
function normalize(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trimEnd();
}

// Retrofits the fix from aa16d7b into services scaffolded before it. drizzle's
// migrate() reads the last-applied migration with a plain SELECT before opening
// a transaction (drizzle-team/drizzle-orm#874), so two init containers starting
// at once can both see "nothing applied yet" and race the same migration. The
// fix ships as generated app code, which npm update cannot reach, and
// express-service is a one-shot scaffolder that throws on re-run — so a
// migration is the only route to an already-generated project.
// What Nx reads off a migration's return value: nextSteps is surfaced to the
// user in the run summary, agentContext is handed to the paired prompt phase as
// advisory hints (see the `prompt` field on this migration's entry in
// migrations.json). Returning them is the structured channel — better than
// leaving the agent to scrape the warnings out of captured console output.
interface MigrationReport {
  nextSteps: string[];
  agentContext: string[];
}

export default async function addMigrateAdvisoryLock(
  tree: Tree,
): Promise<MigrationReport | undefined> {
  const before = readFileSync(BEFORE_PATH, 'utf-8');
  const after = readFileSync(AFTER_PATH, 'utf-8');
  const missing = REQUIRED_MARKERS.filter((marker) => !after.includes(marker));
  if (missing.length > 0) {
    throw new Error(
      `[nx-adsp] ${AFTER_PATH} is missing ${missing.join(', ')} — the packaged ` +
        `migration fixture is incomplete, so nothing was rewritten. This is a ` +
        `packaging bug in @abgov/nx-adsp, not a problem with your workspace.`,
    );
  }
  // The other fixture fails safe (nothing matches, so nothing is rewritten),
  // but silently and with a warning per project — check it too so a truncated
  // asset reports itself rather than looking like every service was customised.
  if (
    !before.includes(DRIZZLE_MIGRATOR) ||
    before.includes('pg_advisory_lock')
  ) {
    throw new Error(
      `[nx-adsp] ${BEFORE_PATH} is not the pre-fix migration runner — the ` +
        `packaged migration fixture is wrong, so nothing was rewritten. This ` +
        `is a packaging bug in @abgov/nx-adsp, not a problem with your workspace.`,
    );
  }

  let updated = 0;
  const skipped: string[] = [];

  for (const [name, project] of getProjects(tree)) {
    const migratePath = joinPathFragments(project.root, MIGRATE_PATH);
    if (!tree.exists(migratePath)) {
      continue;
    }

    const content = tree.read(migratePath, 'utf-8') ?? '';
    // Already serialized — by a newer generator, a previous run of this
    // migration, or by hand.
    if (content.includes('pg_advisory_lock')) {
      continue;
    }
    // Not the file this migration is about: a hand-written runner, or a
    // Prisma-era service from before the Drizzle switch.
    if (!content.includes(DRIZZLE_MIGRATOR)) {
      continue;
    }

    if (normalize(content) !== normalize(before)) {
      // Warned per file so it appears inline next to this migration; the
      // actionable instruction is carried once, in nextSteps, rather than
      // repeated in full for every file.
      logger.warn(
        `[nx-adsp] ${migratePath} (project "${name}") runs drizzle's migrate() with no ` +
          `advisory lock, but differs from the generated version — left untouched.`,
      );
      skipped.push(migratePath);
      continue;
    }

    tree.write(migratePath, after);
    updated++;
  }

  if (updated > 0) {
    await formatFiles(tree);
    logger.info(
      `[nx-adsp] Serialized ${updated} generated migrate.ts file(s) with a Postgres advisory lock.`,
    );
  }

  if (skipped.length === 0) {
    return undefined;
  }

  return {
    nextSteps: [
      `${skipped.length} migration runner(s) still race concurrent init containers: ` +
        `${skipped.join(', ')}. Each runs drizzle's migrate() with no advisory lock but ` +
        `differs from the generated file, so it was left untouched rather than pattern-edited. ` +
        `Wrap each migrate() call in pg_advisory_lock/pg_advisory_unlock on a dedicated ` +
        `pool.connect() client, keeping whatever else the file customises — ` +
        `express-service's files-postgres/src/migrate.ts template is the reference.`,
    ],
    agentContext: skipped.map(
      (path) =>
        `${path} needs the advisory lock applied by hand: it calls drizzle's migrate() with ` +
        `no pg_advisory_lock, and differs from the file this migration knows how to rewrite. ` +
        `Preserve its existing customisations.`,
    ),
  };
}
