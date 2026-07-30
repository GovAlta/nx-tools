import { Tree, joinPathFragments, readProjectConfiguration } from '@nx/devkit';
import { readFileSync } from 'fs';
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
      padding: 2rem;
      line-height: 1.5;
    }
    h1, h2 { color: ${TOKENS.brand}; }
    h1 { font-size: 2rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.25rem; margin-top: 0; }
    .generated-at { color: ${TOKENS.textMuted}; font-size: 0.875rem; margin-top: 0; }
    section {
      background: ${TOKENS.background};
      border: 1px solid ${TOKENS.border};
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      max-width: 960px;
    }
    .cards { display: flex; flex-wrap: wrap; gap: 1rem; }
    .card {
      flex: 1 1 160px;
      border: 1px solid ${TOKENS.border};
      border-radius: 6px;
      padding: 1rem;
    }
    .card .count { font-size: 2rem; font-weight: 700; }
    .card .label { color: ${TOKENS.textMuted}; font-size: 0.875rem; }
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
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid ${TOKENS.border}; }
    th { color: ${TOKENS.textMuted}; font-weight: 600; }
    .synthesis-note { color: ${TOKENS.textMuted}; font-size: 0.8125rem; font-style: italic; }
    .mermaid { text-align: center; }
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

function buildTable(
  inScopeKeys: string[],
  registry: Registry,
  resolvedSet: Set<string>,
  openSet: Set<string>,
  orphanSet: Set<string>,
  artifactSchema: ArtifactSchema,
): string {
  const rows = [...inScopeKeys]
    .sort()
    .map((key) => {
      const entry = registry.get(key);
      const type = parseAncestorRef(key)?.type ?? '';
      return `<tr>
        <td>${escapeHtml(key)}</td>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(entry?.ancestorRefs.join(', ') ?? '')}</td>
        <td>${statusBadge(key, resolvedSet, openSet, orphanSet, artifactSchema)}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr><th>Key</th><th>Type</th><th>Ancestors</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
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

function buildHtml(params: {
  title: string;
  generatedAt: string;
  synthesis: SynthesisResult;
  counts: StatusCounts;
  cardsHtml: string;
  tableHtml: string;
  brokenRefsHtml: string;
  flowchart: string;
  mermaidBundle: string;
}): string {
  const synthesisNote =
    params.synthesis.source === 'deterministic'
      ? '<p class="synthesis-note">LLM synthesis unavailable in this environment — showing computed summary.</p>'
      : `<p class="synthesis-note">Synthesized via ${params.synthesis.source === 'claude' ? 'the claude CLI' : 'gh copilot'}.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(params.title)}</title>
<style>${buildStyles()}</style>
</head>
<body>
<h1>${escapeHtml(params.title)}</h1>
<p class="generated-at">Generated ${escapeHtml(params.generatedAt)}</p>

<section>
<h2>Summary</h2>
<p>${escapeHtml(params.synthesis.text)}</p>
${synthesisNote}
</section>

<section>
<h2>Status</h2>
${params.cardsHtml}
</section>

<section>
<h2>Lineage graph</h2>
<pre class="mermaid">${escapeHtml(params.flowchart)}</pre>
<div class="legend">
<span><span class="legend-swatch" style="background:${TOKENS.success.bg};border:1px solid ${TOKENS.success.border}"></span>Resolved</span>
<span><span class="legend-swatch" style="background:${TOKENS.important.bg};border:1px solid ${TOKENS.important.border}"></span>Open</span>
<span><span class="legend-swatch" style="background:${TOKENS.interactive.bg};border:1px solid ${TOKENS.interactive.border}"></span>Orphaned</span>
<span><span class="legend-swatch" style="background:${TOKENS.background};border:1px solid ${TOKENS.textMuted}"></span>Closed out (terminal)</span>
<span><span class="legend-swatch" style="background:${TOKENS.backgroundSubtle};border:1px dashed ${TOKENS.textMuted}"></span>Context (out of scope)</span>
</div>
</section>

<section>
<h2>Artifacts</h2>
${params.tableHtml}
${params.brokenRefsHtml}
</section>

<script>${params.mermaidBundle}</script>
<script>
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '${TOKENS.interactive.bg}',
    primaryTextColor: '${TOKENS.textDefault}',
    primaryBorderColor: '${TOKENS.interactive.border}',
    lineColor: '${TOKENS.textMuted}',
    fontFamily: '${TOKENS.fontFamily}',
  },
});
mermaid.run();
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

  const flowchart = buildMermaidFlowchart(
    registry,
    renderedKeys,
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
    synthesis,
    counts,
    cardsHtml: buildSummaryCards(counts),
    tableHtml: buildTable(
      inScopeKeys,
      registry,
      resolvedKeySet,
      openKeySet,
      orphanKeySet,
      artifactSchema,
    ),
    brokenRefsHtml: buildBrokenRefsSection(inScopeBrokenRefs),
    flowchart,
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
