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
  tracksResolution?: boolean,
  terminal?: boolean,
): void {
  const schema = readArtifactSchema(host);
  schema[type] = {
    expectedAncestorTypes,
    ...(tracksResolution ? { tracksResolution } : {}),
    ...(terminal ? { terminal } : {}),
  };
  writeJson(host, ARTIFACT_SCHEMA_PATH, schema);
}
