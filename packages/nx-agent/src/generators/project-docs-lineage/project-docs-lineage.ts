import { Tree } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import { ensureGitignoreEntries } from '../../utils/gitignore';
import {
  buildIndex,
  buildRegistry,
  computeViolations,
  YamlError,
} from '../../utils/project-docs-refs';

const LINEAGE_PATH = '.nx-agent/lineage.json';

export default async function (host: Tree) {
  // 100% mechanically derived from other files — committing it would create
  // a second, driftable source of truth the moment anyone adds a reference
  // without re-running this generator, exactly the failure mode backward
  // references were chosen over a forward-ownership model to avoid.
  ensureGitignoreEntries(host, ['.nx-agent/']);

  const yamlErrors: YamlError[] = []
  const registry = buildRegistry(host, yamlErrors);
  const index = buildIndex(host, registry);
  const artifactSchema = readArtifactSchema(host);
  const violations = computeViolations(registry, index, artifactSchema, yamlErrors);

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
  for (const open of violations.resolutionStatus.open) {
    // eslint-disable-next-line no-console
    console.log(`[nx-agent] open (unresolved): ${open}`);
  }
  for (const resolved of violations.resolutionStatus.resolved) {
    // eslint-disable-next-line no-console
    console.log(`[nx-agent] resolved: ${resolved}`);
  }

  host.write(
    LINEAGE_PATH,
    JSON.stringify(
      {
        registry: Object.fromEntries(registry),
        index: Object.fromEntries(index),
        violations,
      },
      null,
      2,
    ),
  );

  // Thrown after the write is staged so a normal run's Tree flush still
  // happens for a clean result — a run with a broken reference rolls that
  // write back (Nx's usual all-or-nothing generator semantics), which is
  // fine: the console output above already says exactly what's broken, and
  // there's no value in persisting a snapshot already known to be wrong.
  // Orphans alone never reach this — an artifact nothing implements yet is a
  // normal, temporary state, not a mistake.
  if (violations.brokenRefs.length > 0) {
    throw new Error(
      `[nx-agent] ${violations.brokenRefs.length} broken project-docs-ancestors reference(s) found — see above.`,
    );
  }
  if (violations.yamlErrors.length > 0) {
    throw new Error(
      `[nx-agent] ${violations.yamlErrors.length} YAML parse error(s) in project-docs frontmatter — fix the malformed file(s) above before continuing.`,
    )
  }
}
