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

const DOMAIN_MODELS_SUBDIR = 'project-docs/domain-models';
const README_TEMPLATE_PATH = join(__dirname, 'README.template.md');

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.';
}

// The container has no standalone value on its own (its README only exists to
// explain the convention for the model about to be added), so this is an
// internal step composed by domain-model rather than its own generator.
function ensureContainerReadme(
  host: Tree,
  containerDir: string,
  scoped: boolean,
): void {
  const sharedNote = scoped
    ? ' This is shared by every project that depends on this library — keep the design consistent across the service and its consumers rather than letting each drift toward its own interpretation.'
    : '';
  const content = readFileSync(README_TEMPLATE_PATH, 'utf-8')
    .split('{{SHARED_CONTEXT_NOTE}}')
    .join(sharedNote);
  ensureReadme(host, containerDir, content);
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project);
  const containerDir = joinPathFragments(targetRoot, DOMAIN_MODELS_SUBDIR);
  const slug = names(options.name).fileName;
  validateProjectDocsSlug(slug, options.name)
  const modelPath = joinPathFragments(containerDir, `${slug}.md`);

  // A repeat/typo'd invocation should fail loudly rather than silently
  // clobbering or duplicating a model — same posture as domain-term. Checked
  // before any write so a failing run has no side effects.
  if (host.exists(modelPath)) {
    throw new Error(
      `[nx-agent] ${modelPath} already exists — edit it directly rather than regenerating it.`,
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
  ensureArtifactSchemaEntry(host, 'domain-models', [
    'bounded-contexts',
    'domain-terms',
  ]);

  const content = [
    '---',
    `name: ${options.name}`,
    `project-docs-ancestors: [${projectDocsAncestors.join(', ')}]`,
    `resolves: [${resolvedRefs.join(', ')}]`,
    '---',
    '',
    '<!-- Design: describe the aggregates, entities, value objects, and invariants here. -->',
    '',
  ].join('\n');
  host.write(modelPath, content);

  for (const ref of resolvedRefs) {
    console.log(`✓ this domain model resolves ${ref}`);
  }

  await formatFiles(host);
}
