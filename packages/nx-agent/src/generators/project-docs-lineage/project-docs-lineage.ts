import { Tree } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import { ensureGitignoreEntries } from '../../utils/gitignore';
import {
  buildIndex,
  buildRegistry,
  computeViolations,
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
  const violations = computeViolations(
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
    violations,
  };

  // --json is a machine surface, so the human lines would be noise in the middle
  // of the document. Nx prints its own "NX Generating ..." banner to stdout too;
  // pair --json with --quiet to suppress it and get a parseable stream.
  if (!options.json) {
    for (const orphan of violations.orphans) {
      // eslint-disable-next-line no-console
      console.log(`[nx-agent] orphan (nothing derives from it yet): ${orphan}`);
    }
    for (const unscoped of violations.unscoped) {
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] unscoped (missing an expected ancestor type): ${unscoped}`,
      );
    }
    for (const broken of violations.brokenRefs) {
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] broken reference "${broken.ref}" in ${broken.referencedFrom}`,
      );
    }
    for (const unparseable of violations.unparseableRefs) {
      // eslint-disable-next-line no-console
      console.log(
        `[nx-agent] unparseable reference "${unparseable.ref}" in ${unparseable.foundIn} — ` +
          `an id may contain only letters, digits, hyphens, and underscores`,
      );
    }
    for (const open of violations.resolutionStatus.open) {
      // eslint-disable-next-line no-console
      console.log(`[nx-agent] open (unresolved): ${open}`);
    }
    for (const resolved of violations.resolutionStatus.resolved) {
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
  const failures: string[] = [];
  if (violations.brokenRefs.length > 0) {
    failures.push(
      `${violations.brokenRefs.length} broken project-docs-ancestors reference(s)`,
    );
  }
  if (violations.unparseableRefs.length > 0) {
    failures.push(
      `${violations.unparseableRefs.length} unparseable project-docs reference(s)`,
    );
  }
  if (violations.yamlErrors.length > 0) {
    failures.push(
      `${violations.yamlErrors.length} YAML parse error(s) in project-docs frontmatter`,
    );
  }
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
