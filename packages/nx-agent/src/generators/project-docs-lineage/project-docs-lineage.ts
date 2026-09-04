import { Tree } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import { ensureGitignoreEntries } from '../../utils/gitignore';
import {
  buildIndex,
  buildRegistry,
  computeFindings,
  Integrity,
  UnparseableRef,
  YamlError,
} from '../../utils/project-docs-refs';
import { Schema } from './schema';

const LINEAGE_PATH = '.nx-agent/lineage.json';

// Bump when a declared field changes shape or leaves; additive fields don't need
// it. The README's "Consumed shape" table is the declaration this number
// versions — a consumer that pins a version and reads an unexpected one fails
// loudly instead of silently misreading a renamed field, which is the failure
// mode that matters here: agent-delivery's scripts and skills are generated
// write-if-missing, so a workspace keeps its copy and no re-run can repair it.
const LINEAGE_SCHEMA_VERSION = 1;

const INTEGRITY_FAILURES: Record<keyof Integrity, (count: number) => string> = {
  brokenRefs: (n) => `${n} broken project-docs-ancestors reference(s)`,
  unparseableRefs: (n) => `${n} unparseable project-docs reference(s)`,
  yamlErrors: (n) => `${n} YAML parse error(s) in project-docs frontmatter`,
  cycles: (n) => `${n} project-docs-ancestors reference cycle(s)`,
  schemaErrors: (n) =>
    `${n} misspelled expectedAncestorTypes entry/entries in artifact-schema.json`,
};

export default async function (host: Tree, options: Schema = {}) {
  // 100% mechanically derived from other files — committing it would create
  // a second, driftable source of truth the moment anyone adds a reference
  // without re-running this generator, exactly the failure mode backward
  // references were chosen over a forward-ownership model to avoid.
  ensureGitignoreEntries(host, ['.nx-agent/']);

  const yamlErrors: YamlError[] = [];
  const unparseableRefs: UnparseableRef[] = [];
  const registry = buildRegistry(host, yamlErrors, unparseableRefs);
  const index = buildIndex(host, registry, unparseableRefs);
  const artifactSchema = readArtifactSchema(host);
  const { integrity, status } = computeFindings(
    registry,
    index,
    artifactSchema,
    yamlErrors,
    unparseableRefs,
  );

  const payload = {
    schemaVersion: LINEAGE_SCHEMA_VERSION,
    registry: Object.fromEntries(registry),
    index: Object.fromEntries(index),
    integrity,
    status,
    // DEPRECATED, removed at schemaVersion 2. Kept because agent-delivery's
    // scripts and skills are generated write-if-missing: an existing workspace
    // keeps the copy that reads these paths, and no generator re-run can
    // repair it — only a migration, which isn't worth ~1000 lines of verbatim
    // fixtures for a field rename while the old paths can simply keep working.
    // Assembled from the very same arrays as integrity/status above, so the
    // two views cannot drift apart.
    violations: {
      brokenRefs: integrity.brokenRefs,
      unparseableRefs: integrity.unparseableRefs,
      yamlErrors: integrity.yamlErrors,
      cycles: integrity.cycles,
      schemaErrors: integrity.schemaErrors,
      orphans: status.unreferenced,
      unscoped: status.unscoped,
      stale: status.stale,
      resolutionStatus: status.resolution,
    },
  };

  // --json is a machine surface, so the human lines would be noise in the middle
  // of the document. Nx prints its own "NX Generating ..." banner to stdout too;
  // pair --json with --quiet to suppress it and get a parseable stream.
  if (!options.json) {
    for (const key of status.unreferenced) {
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] unreferenced (nothing derives from it yet): ${key}`,
      );
    }
    // Grouped by ancestor, not one line per stale edge: editing one widely-cited
    // artifact is a single act, and a flat list of N entries reads as a mess
    // someone learns to skip rather than as the one thing that happened.
    const staleByAncestor = new Map<string, string[]>();
    for (const entry of status.stale) {
      staleByAncestor.set(entry.ancestor, [
        ...(staleByAncestor.get(entry.ancestor) ?? []),
        entry.artifact,
      ]);
    }
    for (const [ancestor, artifacts] of staleByAncestor) {
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] ${ancestor} was revised after ${artifacts.length} artifact(s) ` +
          `derived from it — review pending: ${artifacts.join(', ')}`,
      );
    }
    for (const unscoped of status.unscoped) {
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] unscoped (missing an expected ancestor type): ${unscoped}`,
      );
    }
    for (const broken of integrity.brokenRefs) {
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] broken reference "${broken.ref}" in ${broken.referencedFrom}`,
      );
    }
    for (const schemaError of integrity.schemaErrors) {
      // Names the schema key as well as the value: the value alone doesn't say
      // which entry to go fix, and one bad value affects every artifact of its
      // type at once.
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] artifact-schema.json: "${schemaError.type}" expects ancestor type ` +
          `"${schemaError.expectedAncestorType}" — did you mean "${schemaError.didYouMean}"? ` +
          `Nothing can satisfy it as written, so every ${schemaError.type} artifact would ` +
          `report unscoped.`,
      );
    }
    for (const cycle of integrity.cycles) {
      // Closed back to the first node when printing, so the loop reads as one
      // — the stored form leaves that implicit.
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] reference cycle: ${[...cycle, cycle[0]].join(' -> ')}`,
      );
    }
    for (const unparseable of integrity.unparseableRefs) {
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] unparseable reference "${unparseable.ref}" in ${unparseable.foundIn} — ` +
          `an id may contain only letters, digits, hyphens, and underscores`,
      );
    }
    for (const open of status.resolution.open) {
      // eslint-disable-next-line no-console
      console.log(`[nx-agent] open (unresolved): ${open}`);
    }
    for (const resolved of status.resolution.resolved) {
      // eslint-disable-next-line no-console
      console.log(`[nx-agent] resolved: ${resolved}`);
    }
  }

  host.write(LINEAGE_PATH, JSON.stringify(payload, null, 2));

  // Printed from the same object the file is written from, so the stream and the
  // file can't describe different graphs. Emitted before the --strict throw
  // below on purpose: stdout isn't subject to Nx's write rollback, so --json
  // --strict is the one invocation that yields the graph *and* a failing exit
  // code in a single run.
  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  }

  // A broken reference and a YAML parse error are both recorded in the output
  // above rather than aborting the write, because the consumer that acts on
  // them is a script reading this file (agent-delivery's task-identification),
  // not a human reading this console — and it already models both as its own
  // top-priority signals, signals it can only ever see if the file exists.
  // Aborting the write to force a non-zero exit therefore disabled the exact
  // mechanism that would have reported the problem, and took every unrelated
  // fact in the graph down with it: one dangling reference and the loop reads
  // no open bug, no undesigned requirement, nothing. Worse, .nx-agent/ is
  // gitignored, so locally the previous run's file survives the rollback and
  // the next reader silently consumes a stale graph. Neither is a graph that
  // can't be trusted — it's a complete graph with a known, enumerated gap.
  // Keyed on `keyof Integrity`, so a category added to that interface won't
  // compile until it also has a --strict message here. That's the invariant
  // worth enforcing rather than restating in prose: everything in `integrity`
  // fails --strict, and nothing in `status` does.
  const failures = (Object.keys(INTEGRITY_FAILURES) as (keyof Integrity)[])
    .filter((category) => integrity[category].length > 0)
    .map((category) =>
      INTEGRITY_FAILURES[category](integrity[category].length),
    );
  if (failures.length === 0) {
    return;
  }

  // --strict is for gate use, where the exit code is the point: Nx's
  // all-or-nothing generator semantics mean a throw rolls the staged write
  // back, so --strict alone can't both fail and leave a lineage.json behind.
  // --json escapes that, since stdout is already flushed by here. Orphans and
  // unscoped artifacts never reach this point either way — an artifact nothing
  // implements yet is a normal, temporary state, not a mistake.
  if (options.strict) {
    throw new Error(`[nx-agent] ${failures.join(', ')} found — see above.`);
  }
  if (!options.json) {
    // eslint-disable-next-line no-console
    console.log(
      `[nx-agent] wrote ${LINEAGE_PATH} with ${failures.join(', ')} recorded — re-run with --strict to fail on them.`,
    );
  }
}
