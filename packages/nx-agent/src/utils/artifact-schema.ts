import { Tree, readJson, writeJson } from '@nx/devkit';

const ARTIFACT_SCHEMA_PATH = 'project-docs/artifact-schema.json';

// What ancestor types a given artifact `type` is expected to have — e.g.
// domain-terms expects a bounded-contexts ancestor — whether that type has a
// resolution lifecycle at all (open-questions/blockers do; most types don't)
// — and whether it's terminal: nothing is ever expected to derive from it, so
// zero descendants is what correct looks like, not a sign of neglect (a
// close-out/retrospective artifact, working exactly as intended, still has
// zero descendants forever). All three are data the workspace owns, not
// logic nx-agent owns: project-docs-lineage only ever reads this
// generically (no per-type branches), so a hand-invented artifact kind with
// its own entry here gets the same soft checks for free.
export interface ArtifactTypeSchema {
  expectedAncestorTypes: string[];
  tracksResolution?: boolean;
  terminal?: boolean;
  // Frontmatter fields that carry this type's *content* rather than bookkeeping,
  // and so belong in its digest alongside the body. A structural fact about
  // where a type keeps its meaning, not a policy switch: `requirements` declare
  // `rules` because their rules ARE the artifact (their body is rationale
  // prose), while a `title` or an emptied `questions` list is of no interest to
  // anything downstream. Absent or empty means body-only, which is right for
  // every type that explains itself in prose.
  digestFields?: string[];
}

export type ArtifactSchema = Record<string, ArtifactTypeSchema>;

export function readArtifactSchema(host: Tree): ArtifactSchema {
  if (!host.exists(ARTIFACT_SCHEMA_PATH)) {
    return {};
  }
  return readJson<ArtifactSchema>(host, ARTIFACT_SCHEMA_PATH);
}

// Merge-only: sets/overwrites only the calling generator's own `type` key,
// leaving every other entry — including a hand-added one for a custom
// artifact kind nx-agent knows nothing about — untouched.
export function ensureArtifactSchemaEntry(
  host: Tree,
  type: string,
  expectedAncestorTypes: string[],
  options: {
    tracksResolution?: boolean;
    terminal?: boolean;
    digestFields?: string[];
  } = {},
): void {
  const schema = readArtifactSchema(host);
  schema[type] = {
    expectedAncestorTypes,
    ...(options.tracksResolution
      ? { tracksResolution: options.tracksResolution }
      : {}),
    ...(options.terminal ? { terminal: options.terminal } : {}),
    ...(options.digestFields?.length
      ? { digestFields: options.digestFields }
      : {}),
  };
  writeJson(host, ARTIFACT_SCHEMA_PATH, schema);
}
