import { Tree, joinPathFragments, readProjectConfiguration } from '@nx/devkit';
import { readFileSync } from 'fs';
import { marked } from 'marked';
import {
  ArtifactSchema,
  readArtifactSchema,
} from '../../utils/artifact-schema';
import { ensureGitignoreEntries } from '../../utils/gitignore';
import {
  Registry,
  Violations,
  buildIndex,
  buildRegistry,
  computeViolations,
  parseAncestorRef,
  refKey,
} from '../../utils/project-docs-refs';
import {
  StatusCounts,
  SynthesisResult,
  buildDeterministicSummary,
  synthesize,
} from '../../utils/synthesis';
import { Schema } from './schema';

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

function extractFrontmatterYaml(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1].trim() : '';
}

// A registry key's own format (<project>/type:id) is already constrained in
// practice, but this is the one place it becomes an HTML id/URL fragment, so
// swap anything outside that safe set defensively rather than assume.
function toAnchorId(key: string): string {
  return `artifact-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function toDisplayName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

// Curated, hand-copied subset of @abgov/design-tokens@2.12.0's dist/tokens.css
// (fetched and confirmed current at implementation time, not guessed) — not a
// live dependency on @abgov/design-tokens itself, since nx-agent is
// general-purpose tooling with no existing peer on any @abgov/* UI package
// and this report needs none of their interactive behavior. Re-copy from a
// newer tokens.css if GoA's palette changes and this drifts from the live
// brand — the exact token name each value came from is noted alongside it.
const TOKENS = {
  brand: '#0081a2', // --goa-color-brand-default
  textDefault: '#000000', // --goa-color-greyscale-black / --goa-color-text-default
  textMuted: '#4d4d4d', // --goa-color-greyscale-700
  background: '#ffffff', // --goa-color-greyscale-white
  backgroundSubtle: '#f8f8f8', // --goa-color-greyscale-50
  border: '#cdcdcd', // --goa-color-greyscale-200
  fontFamily: 'acumin-variable, helvetica-neue, arial, sans-serif', // --goa-font-family-sans
  success: { bg: '#f4fff6', border: '#c4e3d2', text: '#006f4c' }, // --goa-color-success-*
  important: { bg: '#fef2c8', border: '#fde3a1', text: '#c28900' }, // --goa-color-important-*
  emergency: { bg: '#fff6f6', border: '#eeaea5', text: '#a91a10' }, // --goa-color-emergency-*
  interactive: { bg: '#e0f1ff', border: '#006dcc', text: '#045092' }, // --goa-color-interactive-*
};

function buildStyles(): string {
  return `
    * { box-sizing: border-box; }
    body {
      font-family: ${TOKENS.fontFamily};
      color: ${TOKENS.textDefault};
      background: ${TOKENS.backgroundSubtle};
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    .app-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: ${TOKENS.background};
      border-bottom: 1px solid ${TOKENS.border};
      padding: 0.75rem 2rem;
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }
    .app-title {
      font-weight: 700;
      color: ${TOKENS.brand};
      text-decoration: none;
      font-size: 1rem;
    }
    .app-meta { font-size: 0.8125rem; color: ${TOKENS.textMuted}; }
    .app-date { font-size: 0.8125rem; color: ${TOKENS.textMuted}; margin-left: auto; }
    .app-main { max-width: 960px; margin: 0 auto; padding: 2rem; }
    .panel[hidden] { display: none !important; }
    .home-section { margin-bottom: 2.5rem; }
    .home-section h2 {
      font-size: 1rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${TOKENS.textMuted};
      margin: 0 0 1rem;
    }
    .home-type-group { margin-bottom: 1.5rem; }
    .home-type-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${TOKENS.textMuted};
      margin-bottom: 0.5rem;
    }
    .card-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .root-card {
      display: block;
      flex: 1 1 180px;
      max-width: 260px;
      border: 1px solid ${TOKENS.border};
      border-radius: 8px;
      padding: 1rem;
      text-decoration: none;
      color: ${TOKENS.textDefault};
      background: ${TOKENS.background};
      transition: border-color 0.15s;
    }
    .root-card:hover { border-color: ${TOKENS.brand}; }
    .rc-type {
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: ${TOKENS.textMuted};
      margin-bottom: 0.25rem;
    }
    .rc-name {
      font-size: 0.9375rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: ${TOKENS.textDefault};
    }
    .rc-meta { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: ${TOKENS.textMuted}; }
    .rc-children { font-size: 0.75rem; color: ${TOKENS.textMuted}; }
    .rc-slug { font-size: 0.6875rem; color: ${TOKENS.textMuted}; font-family: monospace; margin-bottom: 0.375rem; }
    .panel-back { font-size: 0.875rem; color: ${TOKENS.textMuted}; margin-bottom: 1.5rem; }
    .panel-back a { color: ${TOKENS.brand}; text-decoration: none; }
    .context-note {
      background: ${TOKENS.backgroundSubtle};
      border: 1px solid ${TOKENS.border};
      border-radius: 6px;
      padding: 0.625rem 0.875rem;
      font-size: 0.875rem;
      color: ${TOKENS.textMuted};
      margin-bottom: 1.5rem;
    }
    .artifact-type {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${TOKENS.textMuted};
      margin-bottom: 0.25rem;
    }
    .artifact-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: ${TOKENS.textDefault};
      margin: 0 0 0.375rem;
      line-height: 1.2;
    }
    .artifact-slug { font-size: 0.8125rem; color: ${TOKENS.textMuted}; font-family: monospace; margin-bottom: 0.25rem; }
    .artifact-path { font-size: 0.8125rem; color: ${TOKENS.textMuted}; margin-bottom: 1.5rem; }
    .fm-details { border: 1px solid ${TOKENS.border}; border-radius: 6px; margin-bottom: 1.5rem; overflow: hidden; }
    .fm-details > summary { padding: 0.625rem 0.875rem; font-size: 0.8125rem; color: ${TOKENS.textMuted}; cursor: pointer; user-select: none; list-style: none; display: flex; align-items: center; gap: 0.375rem; }
    .fm-details > summary::before { content: "▶"; font-size: 0.5625rem; }
    .fm-details[open] > summary::before { content: "▼"; }
    .fm-pre { margin: 0; padding: 1rem 1.25rem; background: ${TOKENS.backgroundSubtle}; border-top: 1px solid ${TOKENS.border}; font-size: 0.8125rem; line-height: 1.6; overflow-x: auto; white-space: pre-wrap; color: ${TOKENS.textDefault}; }
    .artifact-body {
      line-height: 1.7;
      border-top: 1px solid ${TOKENS.border};
      padding-top: 1.5rem;
      margin-bottom: 2.5rem;
    }
    .artifact-body :first-child { margin-top: 0; }
    .related-grid { display: flex; flex-direction: column; gap: 2rem; border-top: 1px solid ${TOKENS.border}; padding-top: 2rem; }
    .related-section h2 {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${TOKENS.textMuted};
      margin: 0 0 0.75rem;
    }
    .related-count { font-weight: 400; font-size: 0.75rem; color: ${TOKENS.textMuted}; }
    .mini-card-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .mini-card {
      display: inline-flex;
      flex-direction: column;
      gap: 0.125rem;
      border: 1px solid ${TOKENS.border};
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      text-decoration: none;
      color: ${TOKENS.textDefault};
      background: ${TOKENS.backgroundSubtle};
      min-width: 120px;
    }
    .mini-card:hover { border-color: ${TOKENS.brand}; background: ${TOKENS.background}; }
    .mc-type { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.04em; color: ${TOKENS.textMuted}; }
    .mc-name { font-size: 0.875rem; font-weight: 600; }
    .mc-slug { font-size: 0.6875rem; color: ${TOKENS.textMuted}; font-family: monospace; }
    .mc-meta { font-size: 0.75rem; color: ${TOKENS.textMuted}; display: flex; align-items: center; gap: 0.375rem; margin-top: 0.125rem; }
    .mc-children { font-size: 0.75rem; color: ${TOKENS.textMuted}; }
    .mini-card-grid.compact .mini-card { min-width: 0; flex-direction: row; align-items: center; gap: 0.5rem; }
    .mini-card-grid.compact .mc-type { display: none; }
    .mini-card-grid.compact .mc-slug { display: none; }
    .overview-details {
      border: 1px solid ${TOKENS.border};
      border-radius: 8px;
      margin-top: 2.5rem;
      overflow: hidden;
    }
    .overview-details > summary {
      padding: 0.875rem 1.25rem;
      font-size: 0.875rem;
      color: ${TOKENS.textMuted};
      cursor: pointer;
      user-select: none;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .overview-details > summary::before { content: "\\25B6"; font-size: 0.625rem; color: ${TOKENS.textMuted}; }
    .overview-details[open] > summary::before { content: "\\25BC"; }
    .overview-body { padding: 0 1.25rem 1.5rem; border-top: 1px solid ${TOKENS.border}; }
    .overview-section { margin-top: 1.5rem; }
    .overview-section h2 { font-size: 1rem; font-weight: 600; color: ${TOKENS.brand}; margin: 0 0 1rem; }
    .overview-section h3 { font-size: 0.875rem; font-weight: 600; color: ${TOKENS.textDefault}; margin: 1rem 0 0.5rem; }
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 0.125rem 0.625rem;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-resolved { background: ${TOKENS.success.bg}; border: 1px solid ${TOKENS.success.border}; color: ${TOKENS.success.text}; }
    .badge-open { background: ${TOKENS.important.bg}; border: 1px solid ${TOKENS.important.border}; color: ${TOKENS.important.text}; }
    .badge-orphan { background: ${TOKENS.interactive.bg}; border: 1px solid ${TOKENS.interactive.border}; color: ${TOKENS.interactive.text}; }
    .badge-terminal { background: ${TOKENS.background}; border: 1px solid ${TOKENS.textMuted}; color: ${TOKENS.textMuted}; }
    .legend { display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: 0.875rem; color: ${TOKENS.textMuted}; margin-top: 0.75rem; }
    .legend-swatch { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: 3px; margin-right: 0.375rem; vertical-align: middle; }
    .mermaid { text-align: center; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid ${TOKENS.border}; }
    th { color: ${TOKENS.textMuted}; font-weight: 600; }
    .type-group { margin-bottom: 1.5rem; }
    .type-group:last-child { margin-bottom: 0; }
    .type-heading {
      font-size: 0.9375rem;
      font-weight: 600;
      color: ${TOKENS.textDefault};
      margin: 0 0 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .type-note {
      font-size: 0.75rem;
      color: ${TOKENS.textMuted};
      font-weight: 400;
      font-style: italic;
    }
    .type-count {
      margin-left: auto;
      font-size: 0.75rem;
      background: ${TOKENS.backgroundSubtle};
      border: 1px solid ${TOKENS.border};
      border-radius: 999px;
      padding: 0.0625rem 0.5rem;
      color: ${TOKENS.textMuted};
      font-weight: 400;
    }
    .synthesis-note { color: ${TOKENS.textMuted}; font-size: 0.8125rem; font-style: italic; }
    .cards { display: flex; flex-wrap: wrap; gap: 1rem; }
    .card {
      flex: 1 1 160px;
      border: 1px solid ${TOKENS.border};
      border-radius: 6px;
      padding: 1rem;
    }
    .card .count { font-size: 2rem; font-weight: 700; }
    .card .label { color: ${TOKENS.textMuted}; font-size: 0.875rem; }
  `;
}

function isTerminalKey(key: string, artifactSchema: ArtifactSchema): boolean {
  const type = parseAncestorRef(key)?.type;
  return !!type && !!artifactSchema[type]?.terminal;
}

function sanitizeLabel(label: string): string {
  // Mermaid quotes node labels with `"`, so an embedded one would break the
  // node definition — swap for a visually close, harmless substitute rather
  // than rejecting it (key format is already regex-constrained in practice,
  // so this is a defensive fallback, not the expected case).
  return label.replace(/"/g, "'").replace(/\n/g, ' ');
}

// Returns observed artifact types in process-flow order: foundational types
// (those with no expectedAncestorTypes in the schema) appear first, then
// types that depend on them, with terminal types deferred to the end of
// each topological wave. Types not registered in the schema are appended
// alphabetically after schema-known types.
function topoSortTypes(
  artifactSchema: ArtifactSchema,
  observedTypes: string[],
): string[] {
  const known = observedTypes.filter((t) => t in artifactSchema);
  const unknown = observedTypes
    .filter((t) => !(t in artifactSchema))
    .sort((a, b) => a.localeCompare(b));

  // Build successor map: ancestor type → set of types that list it as an
  // expectedAncestorType (so ancestor comes before its successors).
  const successors = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  for (const t of known) {
    successors.set(t, new Set());
    inDegree.set(t, 0);
  }
  for (const t of known) {
    for (const ancestor of artifactSchema[t]?.expectedAncestorTypes ?? []) {
      if (!successors.has(ancestor)) continue;
      successors.get(ancestor)!.add(t);
      inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
    }
  }

  // Kahn's algorithm — within each wave, non-terminal types before terminal.
  const queue = known.filter((t) => (inDegree.get(t) ?? 0) === 0);
  const sorted: string[] = [];
  while (queue.length > 0) {
    queue.sort((a, b) => {
      const aT = !!artifactSchema[a]?.terminal;
      const bT = !!artifactSchema[b]?.terminal;
      if (aT !== bT) return aT ? 1 : -1;
      return a.localeCompare(b);
    });
    const t = queue.shift()!;
    sorted.push(t);
    for (const s of successors.get(t) ?? []) {
      const deg = (inDegree.get(s) ?? 1) - 1;
      inDegree.set(s, deg);
      if (deg === 0) queue.push(s);
    }
  }

  // Append any cycle victims (unusual but defensive), then schema-unknown types.
  const remaining = known
    .filter((t) => !sorted.includes(t))
    .sort((a, b) => a.localeCompare(b));
  return [...sorted, ...remaining, ...unknown];
}

// One node per rendered key (in-scope + context), one edge per ancestor
// reference whose ancestor is itself rendered — an ancestor outside the
// rendered set (a broken ref, or something out of scope with no context
// slot) simply gets no edge, rather than a dangling one. A `resolves` edge
// reuses the same ancestor edge (resolves is always a subset of
// ancestorRefs) with a distinct dotted style instead of drawing both.
function buildMermaidFlowchart(
  registry: Registry,
  renderedKeys: string[],
  inScopeSet: Set<string>,
  resolvedKeys: Set<string>,
  openKeys: Set<string>,
  orphanKeys: Set<string>,
  artifactSchema: ArtifactSchema,
): string {
  const nodeIds = new Map<string, string>();
  renderedKeys.forEach((key, i) => nodeIds.set(key, `n${i}`));

  const lines: string[] = [
    'flowchart TD',
    `classDef resolved fill:${TOKENS.success.bg},stroke:${TOKENS.success.border},color:${TOKENS.success.text}`,
    `classDef open fill:${TOKENS.important.bg},stroke:${TOKENS.important.border},color:${TOKENS.important.text}`,
    `classDef orphan fill:${TOKENS.interactive.bg},stroke:${TOKENS.interactive.border},color:${TOKENS.interactive.text}`,
    `classDef terminal fill:${TOKENS.background},stroke:${TOKENS.textMuted},color:${TOKENS.textMuted}`,
    `classDef context fill:${TOKENS.backgroundSubtle},stroke:${TOKENS.textMuted},color:${TOKENS.textMuted},stroke-dasharray: 4 4`,
  ];

  for (const key of renderedKeys) {
    const id = nodeIds.get(key);
    const isContext = !inScopeSet.has(key);
    const isTerminal = isTerminalKey(key, artifactSchema);
    const cls = isContext
      ? 'context'
      : resolvedKeys.has(key)
        ? 'resolved'
        : openKeys.has(key)
          ? 'open'
          : orphanKeys.has(key)
            ? 'orphan'
            : isTerminal
              ? 'terminal'
              : '';
    const label =
      isTerminal && !isContext ? `✓ ${sanitizeLabel(key)}` : sanitizeLabel(key);
    lines.push(`  ${id}["${label}"]${cls ? `:::${cls}` : ''}`);
  }

  // Every rendered node (including context ones) gets a detail section
  // built below, so every node can link there — clicking navigates to the
  // artifact's own content in place, no dangling links.
  for (const key of renderedKeys) {
    lines.push(
      `  click ${nodeIds.get(key)} "#${toAnchorId(key)}" "View content"`,
    );
  }

  const drawnEdges = new Set<string>();
  for (const key of renderedKeys) {
    const entry = registry.get(key);
    if (!entry) {
      continue;
    }
    const toId = nodeIds.get(key);
    for (const rawRef of entry.ancestorRefs) {
      const parsed = parseAncestorRef(rawRef);
      if (!parsed) {
        continue;
      }
      const ancestorKey = refKey(parsed);
      const fromId = nodeIds.get(ancestorKey);
      if (!fromId) {
        continue;
      }
      const edgeId = `${fromId}->${toId}`;
      if (drawnEdges.has(edgeId)) {
        continue;
      }
      drawnEdges.add(edgeId);
      const isResolves = entry.resolves.includes(rawRef);
      lines.push(
        isResolves
          ? `  ${fromId} -. resolves .-> ${toId}`
          : `  ${fromId} --> ${toId}`,
      );
    }
  }

  return lines.join('\n');
}

const MAX_SYNTHESIS_BODIES = 30;

// The counts alone tell an LLM (or a reader) what happened, not why it
// matters — including the free-text bodies of exactly the artifacts worth a
// second look (open, unresolved; orphaned, nothing built on them yet) gives
// the synthesis something to actually narrate. Bounded to a fixed cap so an
// unusually large workspace never turns this into an unbounded prompt.
function buildSynthesisPrompt(
  host: Tree,
  counts: StatusCounts,
  registry: Registry,
  openKeys: string[],
  orphanKeys: string[],
): string {
  const bodies = [...new Set([...openKeys, ...orphanKeys])]
    .slice(0, MAX_SYNTHESIS_BODIES)
    .map((key) => {
      const entry = registry.get(key);
      if (!entry) {
        return null;
      }
      const content = host.read(entry.path, 'utf-8') ?? '';
      const body = stripFrontmatter(content);
      return `### ${key}\n${body}`;
    })
    .filter((section): section is string => section !== null)
    .join('\n\n');

  return [
    'Write a concise, plain-prose synthesis (2-4 short paragraphs, no headings, no bullet lists) ' +
      'of the current status of this software project, based on the project-docs artifact data ' +
      'below. Focus on what is still open or blocking progress and anything worth flagging at a ' +
      'glance. Do not just repeat the raw counts — narrate what they mean.',
    '',
    `Status counts: ${JSON.stringify(counts)}`,
    '',
    bodies
      ? `Open/orphaned artifact bodies:\n\n${bodies}`
      : 'No open or orphaned artifacts.',
  ].join('\n');
}

function buildSummaryCards(counts: StatusCounts): string {
  const typeCards = Object.entries(counts.byType)
    .map(
      ([type, n]) =>
        `<div class="card"><div class="count">${n}</div><div class="label">${escapeHtml(type)}</div></div>`,
    )
    .join('');
  return `<div class="cards">
    <div class="card"><div class="count">${counts.totalArtifacts}</div><div class="label">Total artifacts</div></div>
    ${typeCards}
    <div class="card"><div class="count">${counts.resolved}</div><div class="label">Resolved</div></div>
    <div class="card"><div class="count">${counts.open}</div><div class="label">Open</div></div>
    <div class="card"><div class="count">${counts.orphans}</div><div class="label">Orphaned</div></div>
    <div class="card"><div class="count">${counts.brokenRefs}</div><div class="label">Broken references</div></div>
  </div>`;
}

function statusBadge(
  key: string,
  resolvedSet: Set<string>,
  openSet: Set<string>,
  orphanSet: Set<string>,
  artifactSchema: ArtifactSchema,
): string {
  if (resolvedSet.has(key)) {
    return '<span class="badge badge-resolved">Resolved</span>';
  }
  if (openSet.has(key)) {
    return '<span class="badge badge-open">Open</span>';
  }
  if (orphanSet.has(key)) {
    return '<span class="badge badge-orphan">Orphan</span>';
  }
  if (isTerminalKey(key, artifactSchema)) {
    return '<span class="badge badge-terminal">Closed out</span>';
  }
  return '';
}

// Groups in-scope artifacts by type in process-flow order (topological sort
// of expectedAncestorTypes from the artifact schema — foundational types
// first, terminal types last). Each type gets a heading with its schema
// annotations and artifact count. Artifacts without a parseable type are
// collected in a trailing "(untyped)" group.
function buildArtifactList(
  inScopeKeys: string[],
  registry: Registry,
  resolvedSet: Set<string>,
  openSet: Set<string>,
  orphanSet: Set<string>,
  artifactSchema: ArtifactSchema,
): string {
  const byType = new Map<string, string[]>();
  const untypedKeys: string[] = [];
  for (const key of inScopeKeys) {
    const type = parseAncestorRef(key)?.type;
    if (!type) {
      untypedKeys.push(key);
    } else {
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(key);
    }
  }

  const sortedTypes = topoSortTypes(artifactSchema, [...byType.keys()]);
  const sections: string[] = [];

  for (const type of sortedTypes) {
    const keys = byType.get(type);
    if (!keys || keys.length === 0) continue;
    keys.sort();

    const typeSchema = artifactSchema[type];
    const typeNote = typeSchema?.terminal
      ? ' <span class="type-note">terminal</span>'
      : typeSchema?.tracksResolution
        ? ' <span class="type-note">tracks resolution</span>'
        : '';

    const rows = keys
      .map((key) => {
        const entry = registry.get(key);
        return `<tr>
        <td><a href="#${toAnchorId(key)}">${escapeHtml(key)}</a></td>
        <td>${escapeHtml(entry?.ancestorRefs.join(', ') ?? '')}</td>
        <td>${statusBadge(key, resolvedSet, openSet, orphanSet, artifactSchema)}</td>
      </tr>`;
      })
      .join('');

    sections.push(`<div class="type-group">
    <h3 class="type-heading">${escapeHtml(type)}${typeNote}<span class="type-count">${keys.length}</span></h3>
    <table>
      <thead><tr><th>Artifact</th><th>Ancestors</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`);
  }

  if (untypedKeys.length > 0) {
    untypedKeys.sort();
    const rows = untypedKeys
      .map((key) => {
        const entry = registry.get(key);
        return `<tr>
        <td><a href="#${toAnchorId(key)}">${escapeHtml(key)}</a></td>
        <td>${escapeHtml(entry?.ancestorRefs.join(', ') ?? '')}</td>
        <td>${statusBadge(key, resolvedSet, openSet, orphanSet, artifactSchema)}</td>
      </tr>`;
      })
      .join('');
    sections.push(`<div class="type-group">
    <h3 class="type-heading">(untyped)<span class="type-count">${untypedKeys.length}</span></h3>
    <table>
      <thead><tr><th>Key</th><th>Ancestors</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`);
  }

  return sections.join('\n');
}

function buildBrokenRefsSection(brokenRefs: Violations['brokenRefs']): string {
  if (brokenRefs.length === 0) {
    return '';
  }
  const items = brokenRefs
    .map(
      (b) =>
        `<li><code>${escapeHtml(b.ref)}</code> referenced from <code>${escapeHtml(b.referencedFrom)}</code></li>`,
    )
    .join('');
  return `<h2>Broken references</h2><ul>${items}</ul>`;
}

// The bundled browser build, inlined directly rather than referenced by a
// separate <script src>, so the report stays a single, fully portable file —
// resolved via require.resolve rather than a hardcoded relative path so it
// works regardless of how node_modules is hoisted/nested.
function readMermaidBundle(): string {
  const bundle = readFileSync(
    require.resolve('mermaid/dist/mermaid.min.js'),
    'utf-8',
  );
  // Defensive: a literal `</script` inside the inlined bundle would
  // prematurely close this document's own <script> tag. Not present in the
  // current mermaid release (checked directly), but the bundle's contents
  // aren't something this repo controls, so guard against a future version
  // introducing one rather than trusting it to stay absent.
  return bundle.replace(/<\/script/gi, '<\\/script');
}

// Builds a map from each key → list of in-scope keys that cite it as an
// ancestor. Context keys and broken refs may appear as map keys (parents),
// but only in-scope keys ever appear as values (children).
function buildChildrenMap(
  registry: Registry,
  inScopeSet: Set<string>,
): Map<string, string[]> {
  const childrenMap = new Map<string, string[]>();
  for (const key of inScopeSet) {
    const entry = registry.get(key);
    if (!entry) continue;
    for (const rawRef of entry.ancestorRefs) {
      const parsed = parseAncestorRef(rawRef);
      if (!parsed) continue;
      const parentKey = refKey(parsed);
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
      childrenMap.get(parentKey)!.push(key);
    }
  }
  return childrenMap;
}

function miniCard(
  key: string,
  registry: Registry,
  childrenMap: Map<string, string[]>,
  resolvedSet: Set<string>,
  openSet: Set<string>,
  orphanSet: Set<string>,
  artifactSchema: ArtifactSchema,
): string {
  const parsed = parseAncestorRef(key);
  const type = parsed?.type ?? '';
  const id = parsed?.id ?? '';
  const name = id || type;
  const children = childrenMap.get(key) ?? [];
  const childCountHtml =
    children.length > 0
      ? `<span class="mc-children">${children.length} child${children.length === 1 ? '' : 'ren'}</span>`
      : '';
  const badge = statusBadge(
    key,
    resolvedSet,
    openSet,
    orphanSet,
    artifactSchema,
  );
  return `<a class="mini-card" href="#${toAnchorId(key)}"><span class="mc-type">${escapeHtml(toDisplayName(type))}</span><span class="mc-name">${escapeHtml(toDisplayName(name))}</span><span class="mc-slug">${escapeHtml(name)}</span><span class="mc-meta">${badge}${childCountHtml}</span></a>`;
}

function buildHomePanel(params: {
  inScopeKeys: string[];
  inScopeSet: Set<string>;
  registry: Registry;
  childrenMap: Map<string, string[]>;
  resolvedSet: Set<string>;
  openSet: Set<string>;
  orphanSet: Set<string>;
  artifactSchema: ArtifactSchema;
  synthesis: SynthesisResult;
  synthesisNote: string;
  cardsHtml: string;
  artifactsHtml: string;
  flowchart: string;
  brokenRefsHtml: string;
}): string {
  // Root keys: in-scope keys whose ancestorRefs all point outside inScopeSet
  const rootKeys = params.inScopeKeys.filter((key) => {
    const entry = params.registry.get(key);
    if (!entry) return true;
    return !entry.ancestorRefs.some((rawRef) => {
      const parsed = parseAncestorRef(rawRef);
      if (!parsed) return false;
      return params.inScopeSet.has(refKey(parsed));
    });
  });

  const initiatingRoots = rootKeys.filter(
    (key) => !isTerminalKey(key, params.artifactSchema),
  );
  const terminatingRoots = rootKeys.filter((key) =>
    isTerminalKey(key, params.artifactSchema),
  );

  // Group initiating roots by type in topo order
  const byType = new Map<string, string[]>();
  for (const key of initiatingRoots) {
    const type = parseAncestorRef(key)?.type ?? '(untyped)';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(key);
  }
  const sortedTypes = topoSortTypes(params.artifactSchema, [...byType.keys()]);

  const typeGroupsHtml = sortedTypes
    .map((type) => {
      const keys = byType.get(type);
      if (!keys || keys.length === 0) return '';
      const cardsHtml = keys
        .map((key) => {
          const parsed = parseAncestorRef(key);
          const id = parsed?.id ?? '';
          const name = id || type;
          const badge = statusBadge(
            key,
            params.resolvedSet,
            params.openSet,
            params.orphanSet,
            params.artifactSchema,
          );
          const children = params.childrenMap.get(key) ?? [];
          const childText =
            children.length > 0
              ? `<span class="rc-children">${children.length} child${children.length === 1 ? '' : 'ren'}</span>`
              : '';
          return `<a class="root-card" href="#${toAnchorId(key)}"><div class="rc-type">${escapeHtml(toDisplayName(type))}</div><div class="rc-name">${escapeHtml(toDisplayName(name))}</div><div class="rc-slug">${escapeHtml(name)}</div><div class="rc-meta">${badge}${childText}</div></a>`;
        })
        .join('');
      return `<div class="home-type-group"><div class="home-type-label">${escapeHtml(toDisplayName(type))}</div><div class="card-grid">${cardsHtml}</div></div>`;
    })
    .join('');

  const startingPointsHtml = `<div class="home-section">
  <h2>Starting points</h2>
  ${typeGroupsHtml || '<p>No root artifacts found.</p>'}
</div>`;

  let closedOutHtml = '';
  if (terminatingRoots.length > 0) {
    const terminatingCardsHtml = terminatingRoots
      .map((key) => {
        const parsed = parseAncestorRef(key);
        const type = parsed?.type ?? '';
        const id = parsed?.id ?? '';
        const name = id || type;
        const badge = statusBadge(
          key,
          params.resolvedSet,
          params.openSet,
          params.orphanSet,
          params.artifactSchema,
        );
        return `<a class="root-card" href="#${toAnchorId(key)}"><div class="rc-type">${escapeHtml(toDisplayName(type))}</div><div class="rc-name">${escapeHtml(toDisplayName(name))}</div><div class="rc-slug">${escapeHtml(name)}</div><div class="rc-meta">${badge}</div></a>`;
      })
      .join('');
    closedOutHtml = `<div class="home-section">
  <h2>Closed out</h2>
  <div class="card-grid">${terminatingCardsHtml}</div>
</div>`;
  }

  const legendHtml = `<div class="legend">
<span><span class="legend-swatch" style="background:${TOKENS.success.bg};border:1px solid ${TOKENS.success.border}"></span>Resolved</span>
<span><span class="legend-swatch" style="background:${TOKENS.important.bg};border:1px solid ${TOKENS.important.border}"></span>Open</span>
<span><span class="legend-swatch" style="background:${TOKENS.interactive.bg};border:1px solid ${TOKENS.interactive.border}"></span>Orphaned</span>
<span><span class="legend-swatch" style="background:${TOKENS.background};border:1px solid ${TOKENS.textMuted}"></span>Closed out (terminal)</span>
<span><span class="legend-swatch" style="background:${TOKENS.backgroundSubtle};border:1px dashed ${TOKENS.textMuted}"></span>Context (out of scope)</span>
</div>`;

  const overviewHtml = `<details class="overview-details">
  <summary>Full overview (graph, table, synthesis)</summary>
  <div class="overview-body">
    <div class="overview-section">
      <h2>Summary</h2>
      <p>${escapeHtml(params.synthesis.text)}</p>
      ${params.synthesisNote}
    </div>
    <div class="overview-section">
      <h2>Status</h2>
      ${params.cardsHtml}
    </div>
    <div class="overview-section">
      <h2>Lineage graph</h2>
      <pre class="mermaid">${escapeHtml(params.flowchart)}</pre>
      ${legendHtml}
    </div>
    <div class="overview-section">
      <h2>Artifacts</h2>
      <p>Organized by type in process-flow order. Click an artifact or a graph node to view its content.</p>
      ${params.artifactsHtml}
      ${params.brokenRefsHtml}
    </div>
  </div>
</details>`;

  return `<div id="home" class="panel" hidden>
${startingPointsHtml}
${closedOutHtml}
${overviewHtml}
</div>`;
}

// One panel per rendered key (in-scope + context). Each panel is hidden until
// the JS navigation shows it in response to a hash change. Context-key panels
// include a note indicating they are outside the current scope.
function buildArtifactDetails(
  host: Tree,
  renderedKeys: string[],
  registry: Registry,
  childrenMap: Map<string, string[]>,
  inScopeSet: Set<string>,
  resolvedSet: Set<string>,
  openSet: Set<string>,
  orphanSet: Set<string>,
  artifactSchema: ArtifactSchema,
): string {
  return renderedKeys
    .map((key) => {
      const entry = registry.get(key);
      if (!entry) return '';

      const parsed = parseAncestorRef(key);
      const type = parsed?.type ?? '';
      const id = parsed?.id ?? '';
      const title = id || key;

      // Back nav: home link + parent links for ancestors in the registry
      const parentLinks = (entry.ancestorRefs ?? [])
        .filter((rawRef) => {
          const p = parseAncestorRef(rawRef);
          return p && registry.has(refKey(p));
        })
        .map((rawRef) => {
          const p = parseAncestorRef(rawRef)!;
          const parentKey = refKey(p);
          const parentDisplay = toDisplayName(p.id || p.type);
          return ` · <a href="#${toAnchorId(parentKey)}">${escapeHtml(parentDisplay)}</a>`;
        })
        .join('');

      const contextNote = !inScopeSet.has(key)
        ? `<div class="context-note">This artifact is outside the current scope — shown as context for in-scope descendants.</div>`
        : '';

      const content = host.read(entry.path, 'utf-8') ?? '';
      const body = stripFrontmatter(content);
      const fmYaml = extractFrontmatterYaml(content);
      const bodyHtml = body ? (marked.parse(body, { async: false }) as string) : '';
      const fmHtml = fmYaml
        ? `<details class="fm-details"${!body ? ' open' : ''}><summary>Frontmatter</summary><pre class="fm-pre">${escapeHtml(fmYaml)}</pre></details>`
        : '';

      const badge = statusBadge(
        key,
        resolvedSet,
        openSet,
        orphanSet,
        artifactSchema,
      );

      // Related: ancestors in registry, in-scope children, in-scope peers
      const ancestorKeys = (entry.ancestorRefs ?? [])
        .filter((rawRef) => {
          const p = parseAncestorRef(rawRef);
          return p && registry.has(refKey(p));
        })
        .map((rawRef) => refKey(parseAncestorRef(rawRef)!));

      const childKeys = (childrenMap.get(key) ?? []).filter((k) =>
        inScopeSet.has(k),
      );

      // Peers share a parent: same type + at least one common in-scope ancestor.
      // Root artifacts (no in-scope ancestors) are peers with other roots of the same type.
      const myAncestorSet = new Set(
        (entry.ancestorRefs ?? [])
          .map((rawRef) => {
            const p = parseAncestorRef(rawRef);
            return p ? refKey(p) : null;
          })
          .filter((k): k is string => k !== null && inScopeSet.has(k)),
      );

      const peerKeys = [...inScopeSet].filter((k) => {
        if (k === key) return false;
        const otherEntry = registry.get(k);
        if (!otherEntry) return false;
        if (myAncestorSet.size === 0) {
          return !(otherEntry.ancestorRefs ?? []).some((rawRef) => {
            const ap = parseAncestorRef(rawRef);
            return ap && inScopeSet.has(refKey(ap));
          });
        }
        return (otherEntry.ancestorRefs ?? []).some((rawRef) => {
          const ap = parseAncestorRef(rawRef);
          return ap && myAncestorSet.has(refKey(ap));
        });
      });

      const relatedSections: string[] = [];

      if (ancestorKeys.length > 0) {
        const cards = ancestorKeys
          .map((k) =>
            miniCard(
              k,
              registry,
              childrenMap,
              resolvedSet,
              openSet,
              orphanSet,
              artifactSchema,
            ),
          )
          .join('');
        relatedSections.push(
          `<div class="related-section"><h2>Ancestors</h2><div class="mini-card-grid">${cards}</div></div>`,
        );
      }

      if (childKeys.length > 0) {
        const cards = childKeys
          .map((k) =>
            miniCard(
              k,
              registry,
              childrenMap,
              resolvedSet,
              openSet,
              orphanSet,
              artifactSchema,
            ),
          )
          .join('');
        relatedSections.push(
          `<div class="related-section"><h2>Builds on this <span class="related-count">(${childKeys.length})</span></h2><div class="mini-card-grid">${cards}</div></div>`,
        );
      }

      if (peerKeys.length > 0) {
        const cards = peerKeys
          .map((k) =>
            miniCard(
              k,
              registry,
              childrenMap,
              resolvedSet,
              openSet,
              orphanSet,
              artifactSchema,
            ),
          )
          .join('');
        relatedSections.push(
          `<div class="related-section"><h2>Also under same parent <span class="related-count">(${peerKeys.length})</span></h2><div class="mini-card-grid compact">${cards}</div></div>`,
        );
      }

      const relatedHtml =
        relatedSections.length > 0
          ? `<div class="related-grid">${relatedSections.join('\n')}</div>`
          : '';

      return `<div id="${toAnchorId(key)}" class="panel" hidden>
  <div class="panel-back"><a href="#home">← Home</a>${parentLinks}</div>
  ${contextNote}
  <div class="artifact-type">${escapeHtml(toDisplayName(type))}</div>
  <h1 class="artifact-title">${escapeHtml(toDisplayName(title))} ${badge}</h1>
  <div class="artifact-slug">${escapeHtml(key)}</div>
  <p class="artifact-path"><code>${escapeHtml(entry.path)}</code></p>
  ${fmHtml}
  ${bodyHtml ? `<div class="artifact-body">${bodyHtml}</div>` : ''}
  ${relatedHtml}
</div>`;
    })
    .join('\n');
}

function buildHtml(params: {
  title: string;
  generatedAt: string;
  counts: StatusCounts;
  homePanelHtml: string;
  detailPanelsHtml: string;
  mermaidBundle: string;
}): string {
  const totalLabel = `${params.counts.totalArtifacts} artifact${params.counts.totalArtifacts === 1 ? '' : 's'}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(params.title)}</title>
<style>${buildStyles()}</style>
</head>
<body>
<header class="app-header">
  <a href="#home" class="app-title">${escapeHtml(params.title)}</a>
  <span class="app-meta">${totalLabel} · ${params.counts.open} open</span>
  <span class="app-date">${escapeHtml(params.generatedAt)}</span>
</header>
<main class="app-main">
${params.homePanelHtml}
${params.detailPanelsHtml}
</main>
<script>${params.mermaidBundle}</script>
<script>
(function() {
  function show(id) {
    document.querySelectorAll('.panel').forEach(function(p) { p.hidden = true; });
    var el = document.getElementById(id) || document.getElementById('home');
    if (el) el.hidden = false;
    window.scrollTo(0, 0);
  }
  function fromHash() { show((location.hash || '').replace(/^#/, '')); }
  window.addEventListener('hashchange', fromHash);
  fromHash();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
      primaryColor: '${TOKENS.interactive.bg}',
      primaryTextColor: '${TOKENS.textDefault}',
      primaryBorderColor: '${TOKENS.interactive.border}',
      lineColor: '${TOKENS.textMuted}',
      fontFamily: '${TOKENS.fontFamily}',
    },
  });
  var overview = document.querySelector('.overview-details');
  if (overview) {
    overview.addEventListener('toggle', function() {
      if (!overview.open || overview.dataset.done) return;
      overview.dataset.done = '1';
      mermaid.run();
    });
  }
})();
</script>
</body>
</html>`;
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project);
  const outputPath =
    options.outputPath ??
    joinPathFragments(targetRoot, 'project-docs', 'report.html');

  // Computed workspace-wide, unconditionally — an artifact's orphan/resolved
  // status is a workspace-wide fact, and building the index from only one
  // project's files would misclassify anything referenced across a project
  // boundary. --project filters what's rendered below, never what's
  // computed here.
  const registry = buildRegistry(host);
  const index = buildIndex(host, registry);
  const artifactSchema = readArtifactSchema(host);
  const violations = computeViolations(registry, index, artifactSchema);

  const allKeys = [...registry.keys()];
  const inScopeKeys = options.project
    ? allKeys.filter(
        (key) => parseAncestorRef(key)?.project === options.project,
      )
    : allKeys;
  const inScopeSet = new Set(inScopeKeys);

  const contextKeys = new Set<string>();
  if (options.project) {
    for (const key of inScopeKeys) {
      const entry = registry.get(key);
      if (!entry) {
        continue;
      }
      for (const rawRef of entry.ancestorRefs) {
        const parsed = parseAncestorRef(rawRef);
        if (!parsed) {
          continue;
        }
        const ancestorKey = refKey(parsed);
        if (!inScopeSet.has(ancestorKey) && registry.has(ancestorKey)) {
          contextKeys.add(ancestorKey);
        }
      }
    }
  }
  const renderedKeys = [...inScopeKeys, ...contextKeys];

  const resolvedKeySet = new Set(violations.resolutionStatus.resolved);
  const openKeySet = new Set(violations.resolutionStatus.open);
  const orphanKeySet = new Set(violations.orphans);

  const byType: Record<string, number> = {};
  for (const key of inScopeKeys) {
    const type = parseAncestorRef(key)?.type;
    if (type) {
      byType[type] = (byType[type] ?? 0) + 1;
    }
  }
  const inScopeOpen = [...openKeySet].filter((key) => inScopeSet.has(key));
  const inScopeResolved = [...resolvedKeySet].filter((key) =>
    inScopeSet.has(key),
  );
  const inScopeOrphans = [...orphanKeySet].filter((key) => inScopeSet.has(key));
  // brokenRefs' own `ref` is by definition NOT a registry key (it's what's
  // missing) — scope by the ref token's own project, not registry
  // membership.
  const inScopeBrokenRefs = options.project
    ? violations.brokenRefs.filter(
        (b) => parseAncestorRef(b.ref)?.project === options.project,
      )
    : violations.brokenRefs;

  const counts: StatusCounts = {
    totalArtifacts: inScopeKeys.length,
    byType,
    open: inScopeOpen.length,
    resolved: inScopeResolved.length,
    orphans: inScopeOrphans.length,
    brokenRefs: inScopeBrokenRefs.length,
  };

  const prompt = buildSynthesisPrompt(
    host,
    counts,
    registry,
    inScopeOpen,
    inScopeOrphans,
  );
  const deterministicSummary = buildDeterministicSummary(counts);
  const synthesis = synthesize(
    prompt,
    deterministicSummary,
    !!options.noSynthesis,
  );

  const synthesisNote =
    synthesis.source === 'deterministic'
      ? '<p class="synthesis-note">LLM synthesis unavailable in this environment — showing computed summary.</p>'
      : `<p class="synthesis-note">Synthesized via ${synthesis.source === 'claude' ? 'the claude CLI' : 'gh copilot'}.</p>`;

  const flowchart = buildMermaidFlowchart(
    registry,
    renderedKeys,
    inScopeSet,
    resolvedKeySet,
    openKeySet,
    orphanKeySet,
    artifactSchema,
  );

  const childrenMap = buildChildrenMap(registry, inScopeSet);

  const homePanelHtml = buildHomePanel({
    inScopeKeys,
    inScopeSet,
    registry,
    childrenMap,
    resolvedSet: resolvedKeySet,
    openSet: openKeySet,
    orphanSet: orphanKeySet,
    artifactSchema,
    synthesis,
    synthesisNote,
    cardsHtml: buildSummaryCards(counts),
    artifactsHtml: buildArtifactList(
      inScopeKeys,
      registry,
      resolvedKeySet,
      openKeySet,
      orphanKeySet,
      artifactSchema,
    ),
    flowchart,
    brokenRefsHtml: buildBrokenRefsSection(inScopeBrokenRefs),
  });

  const detailPanelsHtml = buildArtifactDetails(
    host,
    renderedKeys,
    registry,
    childrenMap,
    inScopeSet,
    resolvedKeySet,
    openKeySet,
    orphanKeySet,
    artifactSchema,
  );

  const html = buildHtml({
    title: options.project
      ? `Project docs report — ${options.project}`
      : 'Project docs report',
    generatedAt: new Date().toISOString(),
    counts,
    homePanelHtml,
    detailPanelsHtml,
    mermaidBundle: readMermaidBundle(),
  });

  host.write(outputPath, html);
  // 100% derived from other files, same as project-docs-lineage's own
  // lineage.json — committing it would create a second, driftable source of
  // truth. Unlike lineage.json, the report lives inside the tracked
  // project-docs/ folder (not a dedicated dot-directory), so only the
  // report itself is ignored here, using its actual resolved path — not a
  // hardcoded pattern — so a custom --outputPath is still correctly covered.
  ensureGitignoreEntries(host, [outputPath]);

  // Deliberately no formatFiles(host) here, matching project-docs-lineage's
  // own precedent (also a single generated, never-hand-edited output file):
  // Prettier would parse and pretty-print the inlined Mermaid bundle — a
  // 3.5MB minified blob — expanding it to roughly double its size on every
  // run. A workspace's own .prettierignore can't be relied on to prevent
  // this, since a consuming workspace has no reason to know to add an entry
  // for this generator's own output path.
}
