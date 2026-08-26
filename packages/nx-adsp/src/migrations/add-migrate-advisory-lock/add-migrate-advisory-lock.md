# Apply the Postgres advisory lock to a customised `migrate.ts`

The generator phase rewrote every `src/migrate.ts` it could identify as the
unmodified file `@abgov/nx-adsp`'s `express-service` generated. It deliberately
left alone any file that differs, rather than pattern-editing source it cannot
positively identify. Finishing those files is this step's only job.

## First, check whether there is anything to do

Stop and make no changes if either of these holds:

1. `<advisory_context>` is absent or lists no files. The generator phase either
   rewrote everything or found nothing to rewrite. **This is the common case.**
2. Every file it does list already contains `pg_advisory_lock`. Someone applied
   the fix by hand; re-applying it would double-lock.

Only the paths named in `<advisory_context>` are in scope. Do not search the
workspace for other candidates, and do not touch a `migrate.ts` the generator
phase already rewrote — `<generator_output>` and whichever change list Nx
included above (`<inspect_changes>` or `<files_changed>`) show which those were.

## Why this matters

`drizzle-orm`'s `migrate()` has no protection against concurrent execution
([drizzle-team/drizzle-orm#874], open, acknowledged upstream). It reads the
last-applied migration with a plain `SELECT` before opening a transaction, so two
replicas starting at once can both see "nothing applied yet" and both run the
same migration. In a deployment this shows up as the second pod's init container
stuck in `Init:CrashLoopBackOff` on an "already exists" error, while the first
pod serves traffic normally — so it reads as a flaky deploy rather than a race.

[drizzle-team/drizzle-orm#874]: https://github.com/drizzle-team/drizzle-orm/issues/874

## What to change

For each file in `<advisory_context>`, make these four edits and nothing else.

1. A stable lock key alongside the existing module-level constants:

   ```ts
   const MIGRATION_LOCK_KEY = 8812345;
   ```

   Use exactly this value. Advisory locks are scoped per-database, not per
   Postgres instance, so it only has to be unique within this app's own
   database — and keeping it identical to the generated file means a service that
   later regenerates does not end up with two different keys.

2. A dedicated client for the lock, taken from the existing pool immediately
   after it is created:

   ```ts
   const lockClient = await pool.connect();
   ```

   It must be its own connection. Taking the lock on a connection that
   `migrate()` also uses can deadlock.

3. Acquire the lock as the first statement inside the `try` that wraps
   `migrate()`:

   ```ts
   await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
   ```

4. Release it and return the client in the matching `finally`, before the pool
   is closed:

   ```ts
   await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
   lockClient.release();
   ```

Ordering is the whole point: a lock taken after `migrate()` serializes nothing,
and one never released strands every later deploy. If the file's structure
differs enough that these four edits do not map cleanly onto it — no `try`/
`finally` around `migrate()`, no `Pool`, a different database client — do not
force them. Leave the file unchanged and say so in your handoff.

## Preserve what the file customises

These files were skipped precisely because a team changed them. Keep every such
change: a different `MIGRATIONS_FOLDER`, extra logging, a seed step, custom error
handling, a different formatting style. Add the lock around what is already
there; do not reformat the file, reorder its imports, or "restore" it toward the
generated version.

## Verify

- The file still compiles: `npx nx build <project>` for the project that owns it
  (`migrate.js` is a second webpack bundle emitted by that same build).
- `pg_advisory_lock` appears before the `migrate()` call, and
  `pg_advisory_unlock` plus `lockClient.release()` appear in the `finally`
  before `pool.end()`.
- The diff for each file contains only the four additions above.

Do not attempt to run the migration against a real database; there is no
Postgres to connect to here, and the lock's behaviour is already covered by
`@abgov/nx-adsp`'s own tests.
