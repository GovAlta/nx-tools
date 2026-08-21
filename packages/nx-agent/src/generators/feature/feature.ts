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

const FEATURES_SUBDIR = 'project-docs/features';
const README_TEMPLATE_PATH = join(__dirname, 'README.template.md');

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.';
}

// The container has no standalone value on its own (its README only exists to
// explain the convention for the feature about to be added), so this is an
// internal step composed by feature rather than its own generator.
function ensureContainerReadme(
  host: Tree,
  containerDir: string,
  scoped: boolean,
): void {
  const sharedNote = scoped
    ? ' This is shared by every project that depends on this library — a feature raised here may be relevant to every consumer, not just the one that requested it.'
    : '';
  const content = readFileSync(README_TEMPLATE_PATH, 'utf-8')
    .split('{{SHARED_CONTEXT_NOTE}}')
    .join(sharedNote);
  ensureReadme(host, containerDir, content);
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project);
  const containerDir = joinPathFragments(targetRoot, FEATURES_SUBDIR);
  const slug = names(options.title).fileName;
  validateProjectDocsSlug(slug, options.title)
  const featurePath = joinPathFragments(containerDir, `${slug}.md`);

  // A repeat/typo'd invocation should fail loudly rather than silently
  // clobbering or duplicating a feature — same posture as domain-model.
  // Checked before any write so a failing run has no side effects.
  if (host.exists(featurePath)) {
    throw new Error(
      `[nx-agent] ${featurePath} already exists — edit it directly rather than regenerating it.`,
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
  // expectedAncestorTypes: [] deliberately unconstrained — a feature can
  // found a brand-new initiative with no ancestors at all, or extend an
  // existing one by naming its service-description. No tracksResolution: a
  // feature's own "done" signal is having a real requirement/service-
  // description descendant, not being answered like an open-question.
  ensureArtifactSchemaEntry(host, 'features', []);

  const content = [
    '---',
    `title: ${options.title}`,
    `project-docs-ancestors: [${projectDocsAncestors.join(', ')}]`,
    `resolves: [${resolvedRefs.join(', ')}]`,
    '---',
    '',
    '<!-- What capability is wanted, and why. This is the raw request Discover decomposes into a',
    '     service-description/requirement — write it the way it was actually asked for. -->',
    '',
  ].join('\n');
  host.write(featurePath, content);

  for (const ref of resolvedRefs) {
    console.log(`✓ this feature resolves ${ref}`);
  }

  await formatFiles(host);
}
