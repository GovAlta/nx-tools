import { Tree, getProjects } from '@nx/devkit';
import * as yaml from 'yaml';
import { ArtifactSchema } from './artifact-schema';

// project-docs-ancestors convention: <type>[:<id>][#fragment], optionally
// qualified with a project name (<project>/<type>...). `type` is the literal
// project-docs/ subfolder name — no singular/plural transformation, so an
// open, unbounded vocabulary of artifact kinds never needs a pluralization
// rule that could be wrong for one nobody's invented yet. `id` is present
// only for a collection-style artifact (many instances, one file each, inside
// a type-named folder); a singular artifact (exactly one file directly under
// project-docs/, no subfolder) is referenced by its bare type, no id.
export interface AncestorRef {
  project?: string;
  type: string;
  id?: string;
  fragment?: string;
}

const ANCESTOR_REF_TOKEN =
  /^(?:([^/]+)\/)?([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?(?:#([a-zA-Z0-9_-]+))?$/;

export function parseAncestorRef(token: string): AncestorRef | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const match = ANCESTOR_REF_TOKEN.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, project, type, id, fragment] = match;
  return { project, type, id, fragment };
}

// The canonical string identity of a reference — everything parseAncestorRef
// can recover except the fragment, which stays opaque/unparsed by design (a
// hint for a human reader, not something this resolves) and so isn't part of
// what makes two references "the same target."
export function refKey(
  ref: Pick<AncestorRef, 'project' | 'type' | 'id'>,
): string {
  const prefix = ref.project ? `${ref.project}/` : '';
  const suffix = ref.id ? `:${ref.id}` : '';
  return `${prefix}${ref.type}${suffix}`;
}

const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---/

// The closed set of frontmatter fields the graph already models as structural
// relationships — excluded from Artifact Metadata so the metadata map never
// duplicates what the registry's own ancestorRefs/resolves fields already
// carry. Adding a new structural field requires an explicit, named change here;
// it never happens implicitly.
const STRUCTURAL_FRONTMATTER_FIELDS = new Set([
  'project-docs-ancestors',
  'resolves',
])

// Returns all frontmatter fields that are not structural (i.e. not already
// modelled by the registry's ancestorRefs/resolves). Values are verbatim —
// no normalisation, no inference, no type coercion. A malformed or absent
// frontmatter block returns {} rather than throwing, matching the defensive
// posture of extractFrontmatterField.
export function extractFrontmatterMetadata(
  content: string,
): Record<string, unknown> {
  const block = FRONTMATTER_BLOCK.exec(content)
  if (!block) return {}
  let frontmatter: unknown
  try {
    frontmatter = yaml.parse(block[1])
  } catch {
    return {}
  }
  if (!frontmatter || typeof frontmatter !== 'object') return {}
  const metadata: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(
    frontmatter as Record<string, unknown>,
  )) {
    if (!STRUCTURAL_FRONTMATTER_FIELDS.has(key)) {
      metadata[key] = value
    }
  }
  return metadata
}

// Real YAML parsing, not hand-rolled per-shape regexes — frontmatter is YAML,
// and a reference-list field is a normal YAML sequence that can legally be
// written as an inline flow array (`[a, b]`), a block list (`- a\n  - b`), or
// (what Prettier reformats an inline array into once it's long enough to wrap)
// a multi-line flow array. A regex per shape silently returned [] — no error,
// no log — for whichever shape it didn't special-case; a real parser handles
// all of them, and anything YAML legally allows in the future, uniformly.
// Shared by every frontmatter reference-list field (`project-docs-ancestors`,
// `resolves`) rather than re-implementing the same parse per field.
export function extractFrontmatterField(
  content: string,
  field: string,
): string[] {
  const block = FRONTMATTER_BLOCK.exec(content);
  if (!block) {
    return [];
  }

  let frontmatter: unknown;
  try {
    frontmatter = yaml.parse(block[1]);
  } catch {
    return [];
  }

  const refs = (frontmatter as Record<string, unknown> | null)?.[field];
  if (!Array.isArray(refs)) {
    return [];
  }
  return refs.filter((ref): ref is string => typeof ref === 'string');
}

// Every artifact-producing generator that supports both --projectDocsAncestors
// and --resolves already duplicates a resolved ref into project-docs-ancestors
// at write time (resolveAncestorsAndResolves, below) — "a resolution is still
// structurally an ancestor" — but that's only true for generator-authored
// files. A hand-authored artifact (the normal state before a type earns its
// own generator) has no such write-time step, so its resolves field is easy
// to write without remembering to duplicate the ref into
// project-docs-ancestors too — nothing enforces that duplication. Unioning
// here, in the one function every ancestor-ref reader (the registry, the
// index buildIndex uses for orphans/brokenRefs, and getAncestors at depth 1)
// already shares, makes the invariant true unconditionally instead of only
// for generator-produced content.
export function extractFrontmatterAncestorRefs(content: string): string[] {
  const ancestors = extractFrontmatterField(content, 'project-docs-ancestors');
  const resolves = extractFrontmatterField(content, 'resolves');
  return [...new Set([...ancestors, ...resolves])];
}

export function extractCommentAncestorRefs(content: string): string[] {
  const match = /project-docs-ancestors:\s*(.+)/.exec(content);
  if (!match) {
    return [];
  }
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// The write-side counterpart, used by domain-term's --project-docs-ancestors
// flag. Always requires the target to already exist — a backward reference
// only makes sense pointing at something already established; deriving from
// a thing that doesn't exist yet would be a forward dependency, the exact
// direction this convention exists to avoid. Returns the canonical type[:id]
// string (project-qualified if the path falls under a project's own
// project-docs/ rather than the workspace root's).
export function resolveRefFromPath(host: Tree, rawPath: string): string {
  const path = rawPath.replace(/^\.\//, '');
  if (!host.exists(path) || !host.isFile(path)) {
    throw new Error(
      `[nx-agent] project-docs-ancestors target not found: ${rawPath}`,
    );
  }

  const segments = path.split('/');
  const docsIndex = segments.lastIndexOf('project-docs');
  if (docsIndex === -1) {
    throw new Error(
      `[nx-agent] ${rawPath} is not under a project-docs/ folder.`,
    );
  }

  const afterDocs = segments.slice(docsIndex + 1);
  const filename = afterDocs[afterDocs.length - 1];
  const slug = filename.replace(/\.[^.]+$/, '');

  let type: string;
  let id: string | undefined;
  if (afterDocs.length === 1) {
    type = slug; // project-docs/<type>.md — singular artifact
  } else if (afterDocs.length === 2) {
    type = afterDocs[0]; // project-docs/<type>/<id>.md — collection member
    id = slug;
  } else {
    throw new Error(
      `[nx-agent] ${rawPath}: only one level of nesting under project-docs/ is supported.`,
    );
  }

  const projectRoot = segments.slice(0, docsIndex).join('/');
  let project: string | undefined;
  if (projectRoot !== '') {
    for (const [name, config] of getProjects(host)) {
      if (config.root === projectRoot) {
        project = name;
        break;
      }
    }
    if (!project) {
      throw new Error(
        `[nx-agent] ${rawPath} is under project-docs/ at "${projectRoot}", which isn't a known project root.`,
      );
    }
  }

  return refKey({ project, type, id });
}

// Shared by every artifact-producing generator that supports both
// --projectDocsAncestors and --resolves: resolves each (same
// resolveRefFromPath, so an unresolvable path throws before any write either
// way), then merges the resolved refs into the ancestors list — a resolution
// is still structurally an ancestor, so getAncestors/getDescendants/unscoped
// traversal sees it regardless of which flag added it — while keeping the
// resolved refs available separately so the caller can also write the
// distinct `resolves` frontmatter field project-docs-lineage's
// resolutionStatus actually reads.
export function resolveAncestorsAndResolves(
  host: Tree,
  projectDocsAncestors: string[] | undefined,
  resolves: string[] | undefined,
): { ancestors: string[]; resolvedRefs: string[] } {
  const ancestors = (projectDocsAncestors ?? []).map((path) =>
    resolveRefFromPath(host, path),
  );
  const resolvedRefs = (resolves ?? []).map((path) =>
    resolveRefFromPath(host, path),
  );
  return {
    ancestors: [...new Set([...ancestors, ...resolvedRefs])],
    resolvedRefs,
  };
}

export interface RegistryEntry {
  path: string;
  ancestorRefs: string[];
  // Refs this artifact explicitly claims to resolve (via --resolves), not
  // just build on — a strict subset of ancestorRefs, since a resolved ref is
  // also written there for traversal. See computeViolations' resolutionStatus.
  resolves: string[];
  // All non-structural frontmatter fields, verbatim. Never undefined — an
  // artifact with no parseable frontmatter block has metadata: {}. Excludes
  // project-docs-ancestors and resolves (already in ancestorRefs/resolves).
  metadata: Record<string, unknown>;
}

export type Registry = Map<string, RegistryEntry>;

export interface DescendantEntry {
  file: string;
  // The descendant's own artifact type — only present when `file` is itself
  // a registered project-docs artifact (a plain source file that merely
  // references one in a comment has no type of its own).
  type?: string;
  // Artifact Metadata from the registry entry for this file — present only
  // when `type` is defined. Sourced directly from the already-computed
  // registry in the same pass; no second file read is performed.
  metadata?: Record<string, unknown>;
}

export type Index = Map<string, DescendantEntry[]>;

// Reverse of a Registry's own path -> key direction, shared by buildIndex
// (to type each descendant that's itself a registered artifact) and
// getDescendants' depth > 1 walk (to hop from a referrer's file back to the
// key something else might reference it by).
function buildPathToKeyMap(registry: Registry): Map<string, string> {
  const pathToKey = new Map<string, string>();
  for (const [key, entry] of registry) {
    pathToKey.set(entry.path, key);
  }
  return pathToKey;
}

const REF_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.md'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.nx']);

function walk(host: Tree, dir: string): string[] {
  const files: string[] = [];
  for (const child of host.children(dir)) {
    const childPath = dir ? `${dir}/${child}` : child;
    if (host.isFile(childPath)) {
      files.push(childPath);
    } else if (!SKIP_DIRS.has(child)) {
      files.push(...walk(host, childPath));
    }
  }
  return files;
}

function projectDocsRoots(host: Tree): string[] {
  const roots = ['project-docs'];
  for (const [, config] of getProjects(host)) {
    roots.push(
      config.root === '.' ? 'project-docs' : `${config.root}/project-docs`,
    );
  }
  return [...new Set(roots)].filter((root) => host.exists(root));
}

// Every project-docs/ artifact in the workspace, keyed by its canonical
// reference string, recording its own ancestor refs (chained artifacts —
// e.g. a domain term deriving from a bounded context).
export function buildRegistry(host: Tree): Registry {
  const registry: Registry = new Map();

  for (const docsRoot of projectDocsRoots(host)) {
    const rootSegments = docsRoot.split('/');
    const projectRoot = rootSegments.slice(0, -1).join('/');
    let project: string | undefined;
    if (projectRoot !== '') {
      for (const [name, config] of getProjects(host)) {
        if (config.root === projectRoot) {
          project = name;
          break;
        }
      }
    }

    for (const child of host.children(docsRoot)) {
      const childPath = `${docsRoot}/${child}`;
      if (host.isFile(childPath)) {
        if (!child.endsWith('.md') || child === 'README.md') {
          continue;
        }
        const type = child.replace(/\.md$/, '');
        registerArtifact(host, registry, childPath, { project, type });
      } else {
        for (const file of host.children(childPath)) {
          const filePath = `${childPath}/${file}`;
          if (
            !host.isFile(filePath) ||
            !file.endsWith('.md') ||
            file === 'README.md'
          ) {
            continue;
          }
          const id = file.replace(/\.md$/, '');
          registerArtifact(host, registry, filePath, {
            project,
            type: child,
            id,
          });
        }
      }
    }
  }

  return registry;
}

function registerArtifact(
  host: Tree,
  registry: Registry,
  path: string,
  ref: Pick<AncestorRef, 'project' | 'type' | 'id'>,
): void {
  const key = refKey(ref);
  const content = host.read(path, 'utf-8') ?? '';
  registry.set(key, {
    path,
    ancestorRefs: extractFrontmatterAncestorRefs(content),
    resolves: extractFrontmatterField(content, 'resolves'),
    metadata: extractFrontmatterMetadata(content),
  });
}

// Every project-docs-ancestors reference found anywhere in the workspace's
// source files, inverted into "referenced by" per target key. Accepts an
// already-built registry to avoid re-walking project-docs/ when the caller
// has one on hand (e.g. project-docs-lineage); builds one otherwise.
export function buildIndex(
  host: Tree,
  registry: Registry = buildRegistry(host),
): Index {
  const index: Index = new Map();
  const pathToKey = buildPathToKeyMap(registry);

  for (const file of walk(host, '')) {
    if (!REF_SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext))) {
      continue;
    }
    const content = host.read(file, 'utf-8') ?? '';
    const isMarkdown = file.endsWith('.md');
    const rawRefs = isMarkdown
      ? extractFrontmatterAncestorRefs(content)
      : extractCommentAncestorRefs(content);

    const descendantKey = pathToKey.get(file);
    const type = descendantKey
      ? (parseAncestorRef(descendantKey)?.type ?? undefined)
      : undefined;

    for (const raw of rawRefs) {
      const parsed = parseAncestorRef(raw);
      if (!parsed) {
        continue;
      }
      const key = refKey(parsed);
      const entries = index.get(key) ?? [];
      entries.push({
        file,
        type,
        ...(type ? { metadata: registry.get(descendantKey!)!.metadata } : {}),
      });
      index.set(key, entries);
    }
  }

  return index;
}

export interface Violations {
  brokenRefs: { ref: string; referencedFrom: string }[];
  orphans: string[];
  unscoped: string[];
  resolutionStatus: { open: string[]; resolved: string[] };
}

// `artifactSchema` is plain data the workspace owns (see utils/artifact-schema.ts)
// mapping an artifact `type` to the ancestor types it's expected to have — this
// function never mentions a concrete type name, so a new artifact kind gets the
// same soft check for free the moment its own generator registers an entry.
// `expectedAncestorTypes` is an all-of list, not any-of: e.g. domain-models
// expects both a bounded-contexts and a domain-terms ancestor, not either —
// a model with only the former is still missing the vocabulary it should be
// built from, so it's still worth flagging.
export function computeViolations(
  registry: Registry,
  index: Index,
  artifactSchema: ArtifactSchema = {},
): Violations {
  const brokenRefs: Violations['brokenRefs'] = [];
  for (const [key, entries] of index) {
    if (!registry.has(key)) {
      for (const entry of entries) {
        brokenRefs.push({ ref: key, referencedFrom: entry.file });
      }
    }
  }

  // A terminal type (declared, same as expectedAncestorTypes/tracksResolution,
  // by its own generator — no hardcoded type name here either) always has
  // zero descendants by design once it's closed out correctly: that's what
  // correct looks like, not neglect, so it's excluded from orphans rather
  // than reported alongside a domain-model nobody's designed against yet.
  const orphans = [...registry.keys()].filter((key) => {
    if (index.has(key)) {
      return false;
    }
    const parsedKey = parseAncestorRef(key);
    return !parsedKey || !artifactSchema[parsedKey.type]?.terminal;
  });

  const unscoped: string[] = [];
  for (const [key, entry] of registry) {
    const parsedKey = parseAncestorRef(key);
    const expected =
      parsedKey && artifactSchema[parsedKey.type]?.expectedAncestorTypes;
    if (!expected || expected.length === 0) {
      continue;
    }
    const ancestorTypes = entry.ancestorRefs
      .map((raw) => parseAncestorRef(raw)?.type)
      .filter((type): type is string => !!type);
    const satisfied = expected.every((type) => ancestorTypes.includes(type));
    if (!satisfied) {
      unscoped.push(key);
    }
  }

  // Which kinds get an open/resolved fact at all is data-driven
  // (tracksResolution), same as expectedAncestorTypes above — no concrete
  // type name here either. "Resolved" is a direct registry-to-registry
  // check (does any artifact's own `resolves` list name this key), not a
  // proxy on referrer type: a blocker or another open question citing this
  // one *because* it's still unresolved would, under a type-based proxy,
  // get misread as resolving it.
  const resolvedKeys = new Set<string>();
  for (const entry of registry.values()) {
    for (const resolved of entry.resolves) {
      resolvedKeys.add(resolved);
    }
  }

  const resolutionStatus: Violations['resolutionStatus'] = {
    open: [],
    resolved: [],
  };
  for (const key of registry.keys()) {
    const parsedKey = parseAncestorRef(key);
    if (!parsedKey || !artifactSchema[parsedKey.type]?.tracksResolution) {
      continue;
    }
    (resolvedKeys.has(key)
      ? resolutionStatus.resolved
      : resolutionStatus.open
    ).push(key);
  }

  return { brokenRefs, orphans, unscoped, resolutionStatus };
}

// The two retrieval directions, deliberately not symmetric in cost. Forward
// (what does this derive from — ancestors) only ever needs the one file
// being asked about — the reference is physically embedded in it. Backward
// (what derives from this — descendants) has no such shortcut: nothing an
// artifact stores on itself can tell you who points at it, since references
// are backward-only by design (see the module comment on AncestorRef) —
// answering it means checking every other file, which is exactly what
// buildIndex already does. Measured against this workspace (~14k source
// files): ~50ms end to end, so a multi-hop walk rebuilds the graph once
// (not per hop) rather than trusting a persisted cache that could go stale
// the moment something changes without re-running project-docs-lineage.
//
// `depth` bounds how many generations to follow (default 1 — direct
// parents/children only, matching each function's single-file/single-lookup
// cost exactly; depth <= 1 never touches the full graph at all). Pass
// Infinity for the full ancestry/descendancy — the walk below already
// terminates correctly on that (JS's `Infinity - 1 === Infinity`, and a
// cycle can't loop forever since a revisited key is skipped rather than
// re-expanded), so there's no special case needed for "unbounded."

function readOwnAncestorRefs(host: Tree, path: string): AncestorRef[] {
  const content = host.read(path, 'utf-8') ?? '';
  const raw = path.endsWith('.md')
    ? extractFrontmatterAncestorRefs(content)
    : extractCommentAncestorRefs(content);
  return raw
    .map((token) => parseAncestorRef(token))
    .filter((ref): ref is AncestorRef => ref !== null);
}

export function getAncestors(
  host: Tree,
  path: string,
  depth = 1,
): AncestorRef[] {
  if (!host.exists(path) || !host.isFile(path)) {
    throw new Error(`[nx-agent] getAncestors: no such file: ${path}`);
  }
  const direct = readOwnAncestorRefs(host, path);
  if (depth <= 1) {
    return direct;
  }

  // Beyond depth 1, each hop only needs a registry entry's own stored
  // `ancestorRefs` (already parsed once per artifact when the registry was
  // built), not another file read — the one-time build is what makes every
  // subsequent hop cheap regardless of how many are requested.
  const registry = buildRegistry(host);
  const visited = new Map<string, AncestorRef>();
  let frontier = direct;
  let remaining = depth - 1;

  while (frontier.length > 0 && remaining > 0) {
    const next: AncestorRef[] = [];
    for (const ref of frontier) {
      const key = refKey(ref);
      if (visited.has(key)) {
        continue;
      }
      visited.set(key, ref);
      const entry = registry.get(key);
      if (!entry) {
        continue;
      }
      for (const raw of entry.ancestorRefs) {
        const parsed = parseAncestorRef(raw);
        if (parsed) {
          next.push(parsed);
        }
      }
    }
    frontier = next;
    remaining--;
  }
  for (const ref of frontier) {
    visited.set(refKey(ref), ref);
  }

  return [...visited.values()];
}

export function getDescendants(
  host: Tree,
  key: string,
  depth = 1,
): DescendantEntry[] {
  const registry = buildRegistry(host);
  const index = buildIndex(host, registry);
  const direct = index.get(key) ?? [];
  if (depth <= 1) {
    return direct;
  }

  // A file can only be walked past if it's itself a registered artifact
  // (has its own key something else could reference) — a plain source file
  // is always a leaf in this direction, since nothing can target it (every
  // reference resolves under project-docs/, never to an arbitrary path).
  const pathToKey = buildPathToKeyMap(registry);

  const visited = new Map<string, DescendantEntry>();
  let frontier = direct;
  let remaining = depth - 1;

  while (frontier.length > 0 && remaining > 0) {
    const next: DescendantEntry[] = [];
    for (const entry of frontier) {
      if (visited.has(entry.file)) {
        continue;
      }
      visited.set(entry.file, entry);
      const nextKey = pathToKey.get(entry.file);
      if (!nextKey) {
        continue;
      }
      next.push(...(index.get(nextKey) ?? []));
    }
    frontier = next;
    remaining--;
  }
  for (const entry of frontier) {
    visited.set(entry.file, entry);
  }

  return [...visited.values()];
}
