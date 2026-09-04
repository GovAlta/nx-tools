import { Tree, getProjects } from '@nx/devkit';
import { createHash } from 'node:crypto';
import * as yaml from 'yaml';
import { ArtifactSchema } from './artifact-schema';

// The allowed character set for project-docs slugs — used by both the
// lineage parser and generator validation so they cannot drift apart.
export const SLUG_CHARS = 'a-zA-Z0-9_-';

const SLUG_INVALID_RE = new RegExp(`[^${SLUG_CHARS}]`, 'g');

export function validateProjectDocsSlug(
  slug: string,
  originalInput: string,
): void {
  const invalid = slug.match(SLUG_INVALID_RE);
  if (!invalid) return;
  const chars = [...new Set(invalid)].map((c) => `"${c}"`).join(', ');
  throw new Error(
    `[nx-agent] "${originalInput}" produces slug "${slug}" containing invalid character(s): ${chars}. ` +
      `Project-docs slugs must contain only letters, digits, hyphens, and underscores.`,
  );
}

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
  // The ancestor's body digest at the time this reference was written — a
  // provenance record, not part of the target's identity, so refKey drops it
  // exactly as it drops `fragment`. Putting it in the key would mean the key
  // changed whenever content changed, fragmenting the registry and index on
  // every edit.
  digest?: string;
  fragment?: string;
}

// `@digest` sits between the id and the fragment — version, then location, the
// way a package spec then anchor reads. Hex-only rather than SLUG_CHARS so it
// can't be confused with an id, and `@` isn't a SLUG char, so a bare id still
// terminates cleanly against it.
const ANCESTOR_REF_TOKEN = new RegExp(
  `^(?:([^/]+)/)?([${SLUG_CHARS}]+)(?::([${SLUG_CHARS}]+))?(?:@([0-9a-f]+))?(?:#([${SLUG_CHARS}]+))?$`,
);

export function parseAncestorRef(token: string): AncestorRef | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const match = ANCESTOR_REF_TOKEN.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, project, type, id, digest, fragment] = match;
  return { project, type, id, digest, fragment };
}

// The canonical string identity of a reference — everything parseAncestorRef
// can recover except the fragment and the digest. The fragment stays
// opaque/unparsed by design (a hint for a human reader, not something this
// resolves); the digest records which version of the target the reference was
// written against. Neither is part of
// what makes two references "the same target," and a
// content-derived key would change on every edit.
export function refKey(
  ref: Pick<AncestorRef, 'project' | 'type' | 'id'>,
): string {
  const prefix = ref.project ? `${ref.project}/` : '';
  const suffix = ref.id ? `:${ref.id}` : '';
  return `${prefix}${ref.type}${suffix}`;
}

const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---/;

// Everything after the frontmatter block, or the whole file when there isn't
// one. Deliberately the *body* only, which is what makes a digest usable at
// all: recording one edits `project-docs-ancestors`, so a whole-file hash would
// make re-pinning a content change and cascade staleness through the entire
// transitive descendancy in waves, each wave's fix triggering the next. A body
// digest stops at depth 1 — and propagates one more hop exactly when the
// re-pin came *with* a real revision, which is when descendants should look.
//
// Excluding frontmatter wholesale, rather than only the two structural fields,
// keeps this independent of where a digest is stored and avoids having to
// canonicalise a parsed YAML object (key order, serialisation) to keep the hash
// stable. The cost, recorded because it is permanent rather than a wart to fix
// later: a type that keeps its meaning in frontmatter is not covered at all.
// `requirements` is that type — its `rules` are the artifact — and they live
// there deliberately, so a real YAML parser can read them (see
// check-example-mapping.mjs, which had two regex-parsing bugs before the move).
export function extractBody(content: string): string {
  const block = FRONTMATTER_BLOCK.exec(content);
  const body = block ? content.slice(block[0].length) : content;
  // Normalised for the three things that vary without meaning: line endings,
  // the blank line Prettier inserts between the frontmatter delimiter and the
  // first line of prose, and trailing whitespace. The middle one is not
  // cosmetic to get right — formatFiles() runs at the end of every generator,
  // so a digest that counted that blank line would be invalidated by the very
  // formatting pass that follows writing it. Leading *indentation* on the first
  // real line is left alone, since that can be a code block.
  return body
    .replace(/\r\n/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd();
}

// Truncated sha256. Not adversarial — a collision costs one missed staleness
// report, not a security property — so 48 bits is ample margin over the 8 hex
// characters the original proposal sketched.
export function digestBody(content: string): string {
  return createHash('sha256')
    .update(extractBody(content))
    .digest('hex')
    .slice(0, 12);
}

// Recursively key-sorted, so a frontmatter reorder — which YAML tooling and
// Prettier are both free to do — can't masquerade as a content change. The
// whole point of a digest is that it moves only when meaning does.
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// The digest a reference is compared against — the single way to compute one,
// so a caller can't accidentally derive a different value and manufacture
// staleness. Body-only unless the type declares digestFields, and when it
// declares none this returns bodyDigest untouched rather than a hash of it, so
// adding the feature left every pin already recorded still valid.
//
// A declared field that the artifact doesn't have contributes `null` rather
// than being skipped, so *removing* the field is a change the digest sees.
export function artifactDigest(
  entry: Pick<RegistryEntry, 'bodyDigest' | 'metadata'>,
  digestFields: string[] = [],
): string {
  if (digestFields.length === 0) {
    return entry.bodyDigest;
  }
  const selected = [...digestFields]
    .sort()
    .map((field) => `${field}=${canonical(entry.metadata[field] ?? null)}`)
    .join('\n');
  return createHash('sha256')
    .update(`${entry.bodyDigest}\n${selected}`)
    .digest('hex')
    .slice(0, 12);
}

// The closed set of frontmatter fields the graph already models as structural
// relationships — excluded from Artifact Metadata so the metadata map never
// duplicates what the registry's own ancestorRefs/resolves fields already
// carry. Adding a new structural field requires an explicit, named change here;
// it never happens implicitly.
const STRUCTURAL_FRONTMATTER_FIELDS = new Set([
  'project-docs-ancestors',
  'resolves',
]);

// Returns all frontmatter fields that are not structural (i.e. not already
// modelled by the registry's ancestorRefs/resolves). Values are verbatim —
// no normalisation, no inference, no type coercion. A malformed or absent
// frontmatter block returns {} rather than throwing, matching the defensive
// posture of extractFrontmatterField.
export function extractFrontmatterMetadata(
  content: string,
  sourcePath?: string,
): Record<string, unknown> {
  const block = FRONTMATTER_BLOCK.exec(content);
  if (!block) return {};
  let frontmatter: unknown;
  try {
    frontmatter = yaml.parse(block[1]);
  } catch (e) {
    console.warn(
      `[project-docs] YAML parse error${sourcePath ? ` in ${sourcePath}` : ''}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return {};
  }
  if (!frontmatter || typeof frontmatter !== 'object') return {};
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    frontmatter as Record<string, unknown>,
  )) {
    if (!STRUCTURAL_FRONTMATTER_FIELDS.has(key)) {
      metadata[key] = value;
    }
  }
  return metadata;
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
  sourcePath?: string,
): string[] {
  const block = FRONTMATTER_BLOCK.exec(content);
  if (!block) {
    return [];
  }

  let frontmatter: unknown;
  try {
    frontmatter = yaml.parse(block[1]);
  } catch (e) {
    console.warn(
      `[project-docs] YAML parse error${sourcePath ? ` in ${sourcePath}` : ''}: ${e instanceof Error ? e.message : String(e)}`,
    );
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
// index buildIndex uses for unreferenced/brokenRefs, and getAncestors at depth 1)
// already shares, makes the invariant true unconditionally instead of only
// for generator-produced content.
export function extractFrontmatterAncestorRefs(
  content: string,
  sourcePath?: string,
): string[] {
  const ancestors = extractFrontmatterField(
    content,
    'project-docs-ancestors',
    sourcePath,
  );
  const resolves = extractFrontmatterField(content, 'resolves', sourcePath);
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
// status.resolution actually reads.
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
  // This artifact's own body digest, so a descendant's recorded pin can be
  // checked without re-reading any file — buildRegistry already holds the
  // content.
  bodyDigest: string;
  ancestorRefs: string[];
  // Refs this artifact explicitly claims to resolve (via --resolves), not
  // just build on — a strict subset of ancestorRefs, since a resolved ref is
  // also written there for traversal. See computeFindings' status.resolution.
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

const REF_SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.cs',
  '.md',
];
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

// A reference string the grammar can't read. Distinct from a broken reference,
// which parses cleanly and simply names something that doesn't exist: this one
// never became a reference at all, so nothing downstream can resolve, invert,
// or classify it. Collected from two places, hence `foundIn` rather than
// brokenRefs' `referencedFrom` — a reference written in some file (a code
// comment or frontmatter), or an artifact's own path-derived key, where the
// offending characters are in the filename itself and the fix is a rename.
export interface UnparseableRef {
  ref: string;
  foundIn: string;
}

// Whether a scanned token was plausibly *meant* to be a reference, and so is
// worth reporting when it doesn't parse. extractCommentAncestorRefs matches the
// bare `project-docs-ancestors:` token anywhere in a source file, which also
// catches generator code that writes that frontmatter and test fixtures that
// assert on it — `[${ancestors.join(', ')}]` is not a typo'd reference, it's a
// template literal, and reporting it as one would bury the real finding in
// noise (35 such matches in this repo alone). Code punctuation is the tell, so
// this admits only the grammar's own charset plus the characters that
// realistically slip into a hand-written id: a period, a stray slash, a space.
const PLAUSIBLE_REF = /^[\w .:/#-]+$/;

function recordUnparseable(
  unparseableRefs: UnparseableRef[],
  ref: string,
  foundIn: string,
): void {
  if (PLAUSIBLE_REF.test(ref)) {
    unparseableRefs.push({ ref, foundIn });
  }
}

// Every project-docs/ artifact in the workspace, keyed by its canonical
// reference string, recording its own ancestor refs (chained artifacts —
// e.g. a domain term deriving from a bounded context).
export function buildRegistry(
  host: Tree,
  yamlErrors: YamlError[] = [],
  unparseableRefs: UnparseableRef[] = [],
): Registry {
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
        registerArtifact(
          host,
          registry,
          childPath,
          { project, type },
          yamlErrors,
          unparseableRefs,
        );
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
          registerArtifact(
            host,
            registry,
            filePath,
            { project, type: child, id },
            yamlErrors,
            unparseableRefs,
          );
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
  yamlErrors: YamlError[],
  unparseableRefs: UnparseableRef[],
): void {
  const key = refKey(ref);
  // An artifact whose own key can't be parsed back is still registered — it
  // exists, and hiding it would be the very failure this records. But every
  // parse-dependent check below degrades on it: it counts as unreferenced
  // regardless, and status.resolution skips it entirely, so a tracked artifact
  // silently stops being reported open or resolved. Since 7b777dd the
  // generators reject these at creation time, so this only catches a
  // hand-authored or pre-existing file.
  if (!parseAncestorRef(key)) {
    unparseableRefs.push({ ref: key, foundIn: path });
  }
  const content = host.read(path, 'utf-8') ?? '';
  const block = FRONTMATTER_BLOCK.exec(content);
  if (block) {
    try {
      yaml.parse(block[1]);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      yamlErrors.push({ path, error });
      // eslint-disable-next-line no-console
      console.log(`[nx-agent] YAML parse error in ${path}: ${error}`);
      registry.set(key, {
        path,
        bodyDigest: digestBody(content),
        ancestorRefs: [],
        resolves: [],
        metadata: {},
      });
      return;
    }
  }
  registry.set(key, {
    path,
    bodyDigest: digestBody(content),
    ancestorRefs: extractFrontmatterAncestorRefs(content, path),
    resolves: extractFrontmatterField(content, 'resolves', path),
    metadata: extractFrontmatterMetadata(content, path),
  });
}

// Every project-docs-ancestors reference found anywhere in the workspace's
// source files, inverted into "referenced by" per target key. Accepts an
// already-built registry to avoid re-walking project-docs/ when the caller
// has one on hand (e.g. project-docs-lineage); builds one otherwise.
export function buildIndex(
  host: Tree,
  registry: Registry = buildRegistry(host),
  unparseableRefs: UnparseableRef[] = [],
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
        // Recorded rather than skipped: a grammar will always meet an id it
        // didn't expect, and dropping it silently turns that into a wrong
        // report (the target looks unreferenced, so it reads as a leaf)
        // instead of a loud one.
        recordUnparseable(unparseableRefs, raw, file);
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

export interface YamlError {
  path: string;
  error: string;
}

// Two containers, split on a property intrinsic to the graph rather than on
// severity: is the defect *in* the graph, or is it a fact the graph is
// correctly reporting?
//
// Integrity means the graph cannot be trusted as a graph — an edge whose
// endpoint doesn't exist, a token that isn't an edge at all, a node whose
// edges couldn't be read. That's a validity claim, not a threshold, which is
// why --strict fails on it and why that isn't configurable: a consumer asking
// "was this graph even constructible" isn't expressing a preference.
export interface Integrity {
  brokenRefs: { ref: string; referencedFrom: string }[];
  unparseableRefs: UnparseableRef[];
  yamlErrors: YamlError[];
  // Each cycle as its own node sequence, first node repeated only implicitly:
  // ['a', 'b'] means a derives from b and b derives from a. A single-element
  // cycle is an artifact naming itself.
  cycles: string[][];
  // A declaration in artifact-schema.json that can never do what it says.
  // `problem` discriminates: 'misspelled' names a value differing from a real
  // one only by pluralization or case, so `didYouMean` is always present;
  // 'structural-field' is a digestFields entry naming a field the graph already
  // models as a relationship, which is excluded from metadata by design and so
  // would silently contribute nothing.
  schemaErrors: {
    type: string;
    property: 'expectedAncestorTypes' | 'digestFields';
    value: string;
    problem: 'misspelled' | 'structural-field';
    didYouMean?: string;
  }[];
}

// Status means the graph is sound and is telling you where the work stands.
// Nothing here is malformed, so none of it fails --strict; gating on any of it
// is a project policy and belongs to the consumer.
//
// Computed from *structure* only — edges and schema expectations. Status an
// artifact declares about itself in frontmatter (a `questions` list, a
// `status:` field) deliberately stays in `metadata`, passed through verbatim
// for the consumer to interpret: the moment this computed a finding from one,
// the library would have taken a position on somebody's workflow, and being
// workflow-agnostic is the property that makes it consumable from outside.
export interface Status {
  resolution: { open: string[]; resolved: string[] };
  // A reference recording a digest that no longer matches the ancestor's body:
  // the ancestor was revised after this artifact was written, so downstream
  // review is pending. Three states, and the silent first one is what makes
  // adoption survivable — an unpinned reference is never reported, so turning
  // this on reports nothing until something is deliberately pinned.
  stale: {
    artifact: string;
    ancestor: string;
    pinnedDigest: string;
    currentDigest: string;
  }[];
  // Nothing derives from it. Named for the mechanism — the index, which is the
  // computed "what references this" inverse, has no entry — rather than
  // "orphan", which inverts the metaphor: references are backward-only, so
  // this is an artifact with no *descendants*, whereas an orphan conventionally
  // has no parents. That case is `unscoped`, and only when a type declares an
  // expectation it fails to meet.
  unreferenced: string[];
  unscoped: string[];
}

// project-docs-ancestors is a derivation relation: it declares what an artifact
// was built *from*. So two artifacts each declaring the other are internally
// contradictory — neither can precede the other — which makes a cycle a defect
// in the graph rather than a fact about the work, however valid each individual
// edge is. Traversal has always terminated safely on one (getAncestors skips a
// revisited key rather than re-expanding it); what it never did was say so, so
// getAncestors(..., Infinity) returned a correct-looking finite set that
// quietly omitted the fact that the ancestry isn't a hierarchy at all.
//
// One cycle per back edge, not every elementary cycle — enumerating those is
// exponential, and naming the nodes involved is what a reader needs to go fix
// it. Edges to keys outside the registry aren't followed: an unresolvable
// target has no outgoing edges of its own, so it can't close a loop, and it's
// already reported as a broken or unparseable reference.
function findCycles(registry: Registry): string[][] {
  // Absent = unvisited, true = on the current DFS path, false = fully explored.
  const onPath = new Map<string, boolean>();
  const path: string[] = [];
  const cycles: string[][] = [];
  const recorded = new Set<string>();

  const visit = (key: string): void => {
    onPath.set(key, true);
    path.push(key);
    for (const raw of registry.get(key)?.ancestorRefs ?? []) {
      const parsed = parseAncestorRef(raw);
      const next = parsed ? refKey(parsed) : null;
      if (!next || !registry.has(next)) {
        continue;
      }
      if (onPath.get(next)) {
        // Rotated so the lexicographically smallest node leads, so the same
        // cycle reached from a different entry point is recognised as the one
        // it already is rather than reported once per member.
        const cycle = path.slice(path.indexOf(next));
        const lowest = cycle.indexOf([...cycle].sort()[0]);
        const canonical = [...cycle.slice(lowest), ...cycle.slice(0, lowest)];
        const fingerprint = canonical.join('\u0000');
        if (!recorded.has(fingerprint)) {
          recorded.add(fingerprint);
          cycles.push(canonical);
        }
      } else if (!onPath.has(next)) {
        visit(next);
      }
    }
    path.pop();
    onPath.set(key, false);
  };

  for (const key of registry.keys()) {
    if (!onPath.has(key)) {
      visit(key);
    }
  }
  return cycles;
}

export interface Findings {
  integrity: Integrity;
  status: Status;
}

// `artifactSchema` is plain data the workspace owns (see utils/artifact-schema.ts)
// mapping an artifact `type` to the ancestor types it's expected to have — this
// function never mentions a concrete type name, so a new artifact kind gets the
// same soft check for free the moment its own generator registers an entry.
// `expectedAncestorTypes` is an all-of list, not any-of: e.g. domain-models
// expects both a bounded-contexts and a domain-terms ancestor, not either —
// a model with only the former is still missing the vocabulary it should be
// built from, so it's still worth flagging.
export function computeFindings(
  registry: Registry,
  index: Index,
  artifactSchema: ArtifactSchema = {},
  yamlErrors: YamlError[] = [],
  unparseableRefs: UnparseableRef[] = [],
): Findings {
  const brokenRefs: Integrity['brokenRefs'] = [];
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
  // correct looks like, not neglect, so it's excluded from unreferenced rather
  // than reported alongside a domain-model nobody's designed against yet.
  // Only a recorded digest that *disagrees* is a finding. Absent means unknown
  // (hand-authored, or predates adoption) and stays silent; a digest recorded
  // against an ancestor that isn't registered is a broken reference, already
  // reported as one, so it isn't second-guessed here.
  const stale: Status['stale'] = [];
  for (const [key, entry] of registry) {
    for (const raw of entry.ancestorRefs) {
      const parsed = parseAncestorRef(raw);
      if (!parsed?.digest) {
        continue;
      }
      const ancestorKey = refKey(parsed);
      const ancestor = registry.get(ancestorKey);
      if (!ancestor) {
        continue;
      }
      const ancestorType = parseAncestorRef(ancestorKey)?.type;
      const currentDigest = artifactDigest(
        ancestor,
        ancestorType ? artifactSchema[ancestorType]?.digestFields : undefined,
      );
      if (currentDigest === parsed.digest) {
        continue;
      }
      stale.push({
        artifact: key,
        ancestor: ancestorKey,
        pinnedDigest: parsed.digest,
        currentDigest,
      });
    }
  }

  const unreferenced = [...registry.keys()].filter((key) => {
    if (index.has(key)) {
      return false;
    }
    const parsedKey = parseAncestorRef(key);
    return !parsedKey || !artifactSchema[parsedKey.type]?.terminal;
  });

  // A type exists if the schema declares it or some artifact is of it — types
  // are literal project-docs/ subfolder names, so a folder with artifacts in it
  // is a real type whether or not it has a schema entry.
  const knownTypes = new Set<string>(Object.keys(artifactSchema));
  for (const key of registry.keys()) {
    const parsedKey = parseAncestorRef(key);
    if (parsedKey) {
      knownTypes.add(parsedKey.type);
    }
  }

  // Deliberately narrower than "names a type that doesn't exist". A type is a
  // literal project-docs/ subfolder name, with no authoritative list of valid
  // ones, so an unknown type is genuinely ambiguous: `requirements` expecting
  // `product-briefs` before the first product brief is written looks identical
  // to a misspelling. Flagging that would fail --strict on a correct schema —
  // and in a fresh workspace, on most of it.
  //
  // What *is* decidable is a value that differs from a real type only by
  // pluralization or case, which is the slip that actually happens (every type
  // name here is plural, so `bounded-context` for `bounded-contexts` is one
  // keystroke). High confidence, so it can name the fix — and a typo that
  // isn't a near-miss of any known type stays unreported, which is the honest
  // outcome for a case nothing can distinguish from a not-yet-populated type.
  //
  // Validated here rather than where an entry is written, because hand-editing
  // artifact-schema.json is a supported path by design ("a hand-added entry for
  // a custom artifact kind gets the same checks for free") — and a check that
  // runs only when someone remembers to run a generator is a check that doesn't
  // run. One implementation covers hand-edited, generator-written and migrated
  // entries.
  const loosely = (type: string) => type.toLowerCase().replace(/s$/, '');
  const byLooseName = new Map<string, string>();
  for (const type of knownTypes) {
    byLooseName.set(loosely(type), type);
  }

  // Which non-structural frontmatter fields artifacts of each type actually
  // carry, so a digestFields entry can be checked against observed reality
  // rather than against a list nobody maintains.
  const fieldsByType = new Map<string, Set<string>>();
  for (const [key, entry] of registry) {
    const type = parseAncestorRef(key)?.type;
    if (!type) {
      continue;
    }
    const seen = fieldsByType.get(type) ?? new Set<string>();
    for (const field of Object.keys(entry.metadata)) {
      seen.add(field);
    }
    fieldsByType.set(type, seen);
  }

  const schemaErrors: Integrity['schemaErrors'] = [];
  const misspelled = new Set<string>();
  for (const [type, entry] of Object.entries(artifactSchema)) {
    for (const expected of entry.expectedAncestorTypes ?? []) {
      if (knownTypes.has(expected)) {
        continue;
      }
      const didYouMean = byLooseName.get(loosely(expected));
      if (didYouMean) {
        schemaErrors.push({
          type,
          property: 'expectedAncestorTypes',
          value: expected,
          problem: 'misspelled',
          didYouMean,
        });
        misspelled.add(expected);
      }
    }

    // digestFields names frontmatter fields, so the type-name check above
    // doesn't apply — but the same two things go wrong one property over, and
    // both are silent: a structural field is excluded from metadata by design,
    // and a misspelled one contributes null for every artifact, leaving the
    // digest stable while it quietly stops tracking the field that was meant.
    const observed = fieldsByType.get(type);
    const byLooseField = new Map(
      [...(observed ?? [])].map((field) => [loosely(field), field]),
    );
    for (const field of entry.digestFields ?? []) {
      if (STRUCTURAL_FRONTMATTER_FIELDS.has(field)) {
        schemaErrors.push({
          type,
          property: 'digestFields',
          value: field,
          problem: 'structural-field',
        });
        continue;
      }
      if (observed?.has(field)) {
        continue;
      }
      // Same discipline as the type check: only a near-miss of a field these
      // artifacts demonstrably carry is decidable. A field nothing has yet is
      // indistinguishable from one that will exist, so it stays silent.
      const didYouMean = byLooseField.get(loosely(field));
      if (didYouMean) {
        schemaErrors.push({
          type,
          property: 'digestFields',
          value: field,
          problem: 'misspelled',
          didYouMean,
        });
      }
    }
  }

  const unscoped: string[] = [];
  for (const [key, entry] of registry) {
    const parsedKey = parseAncestorRef(key);
    const declared =
      parsedKey && artifactSchema[parsedKey.type]?.expectedAncestorTypes;
    // Only a *confirmed* misspelling is dropped. It can never be satisfied, so
    // checking it would report every artifact of this type as unscoped forever,
    // pointing at artifacts that are correct — the schema is what's wrong, and
    // schemaErrors says so with the fix. An expectation that's merely unknown
    // is still checked, since it may well be a real type nothing populates yet.
    const expected = declared?.filter((type) => !misspelled.has(type));
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

  const resolution: Status['resolution'] = {
    open: [],
    resolved: [],
  };
  for (const key of registry.keys()) {
    const parsedKey = parseAncestorRef(key);
    if (!parsedKey || !artifactSchema[parsedKey.type]?.tracksResolution) {
      continue;
    }
    (resolvedKeys.has(key) ? resolution.resolved : resolution.open).push(key);
  }

  return {
    integrity: {
      brokenRefs,
      unparseableRefs,
      yamlErrors,
      cycles: findCycles(registry),
      schemaErrors,
    },
    status: { resolution, unreferenced, unscoped, stale },
  };
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
