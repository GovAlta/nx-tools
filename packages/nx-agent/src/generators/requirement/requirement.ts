// project-docs-ancestors: domain-models:lineage-graph-metadata
import {
  Tree,
  formatFiles,
  joinPathFragments,
  names,
  readProjectConfiguration,
} from '@nx/devkit';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'yaml';
import { ensureArtifactSchemaEntry } from '../../utils/artifact-schema';
import { ensureReadme } from '../../utils/readme';
import {
  resolveAncestorsAndResolves,
  validateProjectDocsSlug,
} from '../../utils/project-docs-refs';
import { Schema } from './schema';

const REQUIREMENTS_SUBDIR = 'project-docs/requirements';
const README_TEMPLATE_PATH = join(__dirname, 'README.template.md');

// The frontmatter block regex — same pattern as in project-docs-refs.ts,
// reproduced here rather than exported from that module since this is a
// generator-local concern (ID scanning from the Tree at write time).
const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---/;
const REQ_ID_PATTERN = /^req-(\d+)$/;

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.';
}

// Scans all requirement files in the container directory from the Tree
// (always current — no dependency on a pre-built lineage.json) and returns
// the next unused req-NNN id, left-padded to three digits.
function nextRequirementId(host: Tree, containerDir: string): string {
  if (!host.exists(containerDir)) {
    return 'req-001';
  }
  const maxN = host
    .children(containerDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .reduce((max, file) => {
      const content =
        host.read(joinPathFragments(containerDir, file), 'utf-8') ?? '';
      const block = FRONTMATTER_BLOCK.exec(content);
      if (!block) return max;
      let fm: unknown;
      try {
        fm = yaml.parse(block[1]);
      } catch {
        return max;
      }
      const id = (fm as Record<string, unknown> | null)?.['id'];
      if (typeof id !== 'string') return max;
      const match = REQ_ID_PATTERN.exec(id);
      if (!match) return max;
      return Math.max(max, parseInt(match[1], 10));
    }, 0);
  return `req-${String(maxN + 1).padStart(3, '0')}`;
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project);
  const containerDir = joinPathFragments(targetRoot, REQUIREMENTS_SUBDIR);
  const slug = names(options.title).fileName;
  validateProjectDocsSlug(slug, options.title)
  const requirementPath = joinPathFragments(containerDir, `${slug}.md`);

  // Fail loudly before any write — a duplicate is always a mistake, not an
  // idempotent re-run (same guard as domain-term).
  if (host.exists(requirementPath)) {
    throw new Error(
      `[nx-agent] ${requirementPath} already exists — edit it directly rather than regenerating it.`,
    );
  }

  // Resolve and validate before any write — an unresolvable path throws here,
  // so a failing run still has no side effects.
  const { ancestors: projectDocsAncestors, resolvedRefs } =
    resolveAncestorsAndResolves(
      host,
      options.projectDocsAncestors,
      options.resolves,
    );

  const id = nextRequirementId(host, containerDir);

  const readmeContent = readFileSync(README_TEMPLATE_PATH, 'utf-8');
  ensureReadme(host, containerDir, readmeContent);
  // rules is the requirement; the body is rationale prose. So a rules change
  // is what should mark descendants stale, and a title fix or an answered
  // question should not.
  ensureArtifactSchemaEntry(host, 'requirements', ['product-briefs'], {
    digestFields: ['rules'],
  });

  const content = [
    '---',
    `title: ${options.title}`,
    `id: ${id}`,
    `project-docs-ancestors: [${projectDocsAncestors.join(', ')}]`,
    `resolves: [${resolvedRefs.join(', ')}]`,
    'rules: []',
    'questions: []',
    '---',
    '',
    // The body is rationale — *why* this requirement exists — deliberately
    // separate from `rules`, which is *what* must be true and how you'd test
    // it. Rules stay structured frontmatter because three consumers parse them
    // (check-example-mapping, task-identification's refinement signal, and the
    // lineage metadata passthrough), and prose in the body is where the
    // constraint behind them can be explained at the point someone reads it.
    // Scaffolded as a prompt rather than left blank so the gap is visible.
    '## Rationale',
    '',
    '<!-- Why this requirement exists: the constraint, obligation, or user need',
    '     behind it. What breaks, or who is blocked, without it. The product brief',
    '     this derives from carries the wider goal; this is the part specific to',
    '     this requirement. Replace this comment. -->',
    '',
  ].join('\n');
  host.write(requirementPath, content);

  for (const ref of resolvedRefs) {
    // eslint-disable-next-line no-console
    console.log(`✓ this requirement resolves ${ref}`);
  }

  await formatFiles(host);
}
