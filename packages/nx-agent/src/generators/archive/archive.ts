// project-docs-ancestors: cli-designs:archive-generator
import { Tree, formatFiles } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import {
  buildIndex,
  buildRegistry,
  Index,
  parseAncestorRef,
  Registry,
} from '../../utils/project-docs-refs';
import { ArchiveReason, Schema } from './schema';

const PROJECT_DOCS_PREFIX = 'project-docs/';
const ARCHIVE_SEGMENT = 'archive/';

// Inserts archive/ immediately after the project-docs/ segment, preserving any leading
// project-root prefix (e.g. apps/my-app/project-docs/features/foo.md →
// apps/my-app/project-docs/archive/features/foo.md).
function archiveDestination(sourcePath: string): string {
  const pdIdx = sourcePath.indexOf(PROJECT_DOCS_PREFIX);
  const prefix = sourcePath.slice(0, pdIdx + PROJECT_DOCS_PREFIX.length);
  const after = sourcePath.slice(pdIdx + PROJECT_DOCS_PREFIX.length);
  return `${prefix}${ARCHIVE_SEGMENT}${after}`;
}

function injectArchiveReason(content: string, archiveReason: ArchiveReason): string {
  const closingFm = content.indexOf('\n---');
  if (content.startsWith('---') && closingFm !== -1) {
    return (
      content.slice(0, closingFm) +
      `\narchive-reason: ${archiveReason}` +
      content.slice(closingFm)
    );
  }
  return `---\narchive-reason: ${archiveReason}\n---\n\n${content}`;
}

// Derive the registry key for a DescendantEntry (must have a type).
function entryKey(file: string, type: string): string {
  // file: project-docs[/archive]/<type>/<id>.md
  const afterPd = file.startsWith(PROJECT_DOCS_PREFIX)
    ? file.slice(PROJECT_DOCS_PREFIX.length)
    : file;
  const withoutArchive = afterPd.startsWith(ARCHIVE_SEGMENT)
    ? afterPd.slice(ARCHIVE_SEGMENT.length)
    : afterPd;
  // withoutArchive: <type>/<id>.md — drop the type prefix and .md
  const id = withoutArchive.replace(/\.md$/, '').split('/').slice(1).join('/');
  return `${type}:${id}`;
}

// Collect all transitive descendant keys for a given starting key.
// Result is in depth-first order: leaves first, startKey last.
function collectTransitiveKeys(startKey: string, index: Index): string[] {
  const visited = new Set<string>([startKey]);
  const result: string[] = [];

  function visit(key: string): void {
    for (const entry of index.get(key) ?? []) {
      if (!entry.type) continue;
      const childKey = entryKey(entry.file, entry.type);
      if (visited.has(childKey)) continue;
      visited.add(childKey);
      visit(childKey);
      result.push(childKey);
    }
  }

  visit(startKey);
  result.push(startKey);
  return result;
}

// Check whether the artifact at `key` is reachable from more than one features: root.
// Pre-built subtrees map: featureKey → Set of all its transitive descendant keys.
function isSharedDescendant(
  key: string,
  subtreesByFeature: Map<string, Set<string>>,
): boolean {
  let count = 0;
  for (const subtree of subtreesByFeature.values()) {
    if (subtree.has(key)) {
      count++;
      if (count > 1) return true;
    }
  }
  return false;
}

// Returns true if key itself is a terminal type, or if any transitive descendant is.
function hasTerminalDescendant(
  key: string,
  index: Index,
  artifactSchema: ReturnType<typeof readArtifactSchema>,
  visited = new Set<string>(),
): boolean {
  if (visited.has(key)) return false;
  visited.add(key);

  const parsed = parseAncestorRef(key);
  if (parsed && artifactSchema[parsed.type]?.terminal) return true;

  for (const entry of index.get(key) ?? []) {
    if (!entry.type) continue;
    if (artifactSchema[entry.type]?.terminal) return true;
    const childKey = entryKey(entry.file, entry.type);
    if (hasTerminalDescendant(childKey, index, artifactSchema, visited)) return true;
  }
  return false;
}

export default async function (host: Tree, options: Schema) {
  const { featurePath, archiveReason } = options;

  if (!host.exists(featurePath)) {
    throw new Error(`[nx-agent] ${featurePath} does not exist`);
  }
  if (!host.isFile(featurePath)) {
    throw new Error(`[nx-agent] ${featurePath} is not a file`);
  }

  const pdIndex = featurePath.indexOf(PROJECT_DOCS_PREFIX);
  if (pdIndex === -1) {
    throw new Error(`[nx-agent] ${featurePath} is not under a project-docs/ folder`);
  }

  const afterPd = featurePath.slice(pdIndex + PROJECT_DOCS_PREFIX.length);
  if (afterPd.startsWith(ARCHIVE_SEGMENT)) {
    throw new Error(`[nx-agent] ${featurePath} is already in the archive`);
  }

  const segments = afterPd.split('/');
  if (segments.length !== 2) {
    throw new Error(
      `[nx-agent] ${featurePath}: expected exactly two path segments after project-docs/ (<type>/<id>.md)`,
    );
  }

  const [featureType] = segments;
  if (featureType !== 'features') {
    throw new Error(
      `[nx-agent] ${featurePath} is not a features/ artifact — the archive generator targets feature roots only`,
    );
  }

  const registry: Registry = buildRegistry(host);
  const index: Index = buildIndex(host, registry);
  const artifactSchema = readArtifactSchema(host);

  // Resolve the registry key by path lookup — handles both workspace-root and
  // project-scoped paths (project-scoped keys carry a "project/" prefix).
  const featureKey = [...registry.entries()].find(([, e]) => e.path === featurePath)?.[0];

  if (!featureKey) {
    throw new Error(
      `[nx-agent] ${featurePath} is not registered in the project-docs graph — ensure the file has valid frontmatter`,
    );
  }

  // Build subtrees for ALL features so we can detect shared descendants
  const subtreesByFeature = new Map<string, Set<string>>();
  for (const key of registry.keys()) {
    const parsed = parseAncestorRef(key);
    if (parsed?.type !== 'features') continue;
    const subtreeKeys = collectTransitiveKeys(key, index);
    // Exclude the feature itself from the subtree set (it's the root, not a descendant)
    const descendants = new Set(subtreeKeys.slice(0, -1));
    subtreesByFeature.set(key, descendants);
  }

  // Collect this feature's subtree
  const subtreeKeys = collectTransitiveKeys(featureKey, index);

  // Partition: shared descendants are left in place
  const featureSubtree = subtreesByFeature.get(featureKey) ?? new Set<string>();
  const toArchive: string[] = [];
  const sharedLeft: string[] = [];

  const permanentLeft: string[] = [];

  for (const key of subtreeKeys) {
    if (key === featureKey) {
      toArchive.push(key);
      continue;
    }
    const type = parseAncestorRef(key)?.type;
    if (type && artifactSchema[type]?.permanent) {
      permanentLeft.push(key);
    } else if (
      isSharedDescendant(key, subtreesByFeature) &&
      featureSubtree.has(key)
    ) {
      sharedLeft.push(key);
    } else {
      toArchive.push(key);
    }
  }

  // Pre-flight: check destination collisions
  for (const key of toArchive) {
    const entry = registry.get(key);
    if (!entry) continue;
    const dest = archiveDestination(entry.path);
    if (host.exists(dest)) {
      throw new Error(
        `[nx-agent] ${dest} already exists — resolve the collision before archiving`,
      );
    }
  }

  // Pre-flight: completeness guard (completed only)
  if (archiveReason === 'completed') {
    const incomplete: string[] = [];
    for (const key of toArchive) {
      if (key === featureKey) continue;
      if (!hasTerminalDescendant(key, index, artifactSchema)) {
        incomplete.push(key);
      }
    }
    if (incomplete.length > 0) {
      throw new Error(
        `[nx-agent] completeness guard failed — the following artifacts have no terminal descendant:\n` +
          incomplete.map((k) => `  ${k}`).join('\n'),
      );
    }
  }

  // Execute moves (all pre-flights passed; leaves first, feature last)
  for (const key of toArchive) {
    const entry = registry.get(key);
    if (!entry) continue;
    const source = entry.path;
    const dest = archiveDestination(source);
    const content = host.read(source, 'utf-8') ?? '';
    host.write(dest, injectArchiveReason(content, archiveReason));
    host.delete(source);
    // eslint-disable-next-line no-console
    console.log(`[nx-agent] archived ${source} → ${dest}`);
  }

  for (const key of sharedLeft) {
    const entry = registry.get(key);
    if (!entry) continue;
    // eslint-disable-next-line no-console
    console.log(`[nx-agent] left in place (shared): ${entry.path}`);
  }

  for (const key of permanentLeft) {
    const entry = registry.get(key);
    if (!entry) continue;
    // eslint-disable-next-line no-console
    console.log(`[nx-agent] left in place (permanent vocabulary): ${entry.path}`);
  }

  await formatFiles(host);
}
