import {
  Tree,
  formatFiles,
  joinPathFragments,
  names,
  readProjectConfiguration,
} from '@nx/devkit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ensureArtifactSchemaEntry } from '../../utils/artifact-schema';
import { ensureReadme } from '../../utils/readme';
import {
  resolveAncestorsAndResolves,
  validateProjectDocsSlug,
} from '../../utils/project-docs-refs';
import { Schema } from './schema';

const BOUNDED_CONTEXTS_SUBDIR = 'project-docs/bounded-contexts';
const README_TEMPLATE_PATH = join(__dirname, 'README.template.md');

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.';
}

// The container has no standalone value on its own (its README only exists to
// explain the convention for the context about to be added), so this is an
// internal step composed by bounded-context rather than its own generator.
function ensureContainerReadme(
  host: Tree,
  containerDir: string,
  scoped: boolean,
): void {
  const sharedNote = scoped
    ? ' This is shared by every project that depends on this library — keep the boundary consistent across the service and its consumers rather than letting each drift toward its own interpretation.'
    : '';
  const content = readFileSync(README_TEMPLATE_PATH, 'utf-8')
    .split('{{SHARED_CONTEXT_NOTE}}')
    .join(sharedNote);
  ensureReadme(host, containerDir, content);
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project);
  const containerDir = joinPathFragments(targetRoot, BOUNDED_CONTEXTS_SUBDIR);
  const slug = names(options.name).fileName;
  validateProjectDocsSlug(slug, options.name)
  const contextPath = joinPathFragments(containerDir, `${slug}.md`);

  // A repeat/typo'd invocation should fail loudly rather than silently
  // clobbering or duplicating a context — same posture as domain-term.
  // Checked before any write so a failing run has no side effects.
  if (host.exists(contextPath)) {
    throw new Error(
      `[nx-agent] ${contextPath} already exists — edit it directly rather than regenerating it.`,
    );
  }

  // Resolved (and, in doing so, validated) before any write — a path that
  // doesn't resolve to an existing project-docs/ artifact throws here, same
  // as the duplicate check above, so a failing run still has no side effects.
  const { ancestors: projectDocsAncestors, resolvedRefs } =
    resolveAncestorsAndResolves(
      host,
      options.projectDocsAncestors,
      options.resolves,
    );

  ensureContainerReadme(host, containerDir, !!options.project);
  ensureArtifactSchemaEntry(host, 'bounded-contexts', []);

  const content = [
    '---',
    `name: ${options.name}`,
    'aliases: []',
    'not_confused_with: []',
    `project-docs-ancestors: [${projectDocsAncestors.join(', ')}]`,
    `resolves: [${resolvedRefs.join(', ')}]`,
    '---',
    '',
    "<!-- Definition: describe what's inside this boundary, and what's explicitly outside it. -->",
    '',
  ].join('\n');
  host.write(contextPath, content);

  for (const ref of resolvedRefs) {
    console.log(`✓ this bounded context resolves ${ref}`);
  }

  await formatFiles(host);
}
