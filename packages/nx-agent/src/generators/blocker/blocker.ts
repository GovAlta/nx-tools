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
  resolveRefFromPath,
  validateProjectDocsSlug,
} from '../../utils/project-docs-refs';
import { Schema } from './schema';

const BLOCKERS_SUBDIR = 'project-docs/blockers';
const README_TEMPLATE_PATH = join(__dirname, 'README.template.md');

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.';
}

// The container has no standalone value on its own (its README only exists to
// explain the convention for the blocker about to be added), so this is an
// internal step composed by blocker rather than its own generator.
function ensureContainerReadme(
  host: Tree,
  containerDir: string,
  scoped: boolean,
): void {
  const sharedNote = scoped
    ? ' This is shared by every project that depends on this library — a blocker raised here may affect every consumer, not just the one that noticed it.'
    : '';
  const content = readFileSync(README_TEMPLATE_PATH, 'utf-8')
    .split('{{SHARED_CONTEXT_NOTE}}')
    .join(sharedNote);
  ensureReadme(host, containerDir, content);
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project);
  const containerDir = joinPathFragments(targetRoot, BLOCKERS_SUBDIR);
  const slug = names(options.description).fileName;
  validateProjectDocsSlug(slug, options.description)
  const blockerPath = joinPathFragments(containerDir, `${slug}.md`);

  // A repeat/typo'd invocation should fail loudly rather than silently
  // clobbering or duplicating a blocker — same posture as domain-model.
  // Checked before any write so a failing run has no side effects.
  if (host.exists(blockerPath)) {
    throw new Error(
      `[nx-agent] ${blockerPath} already exists — edit it directly rather than regenerating it.`,
    );
  }

  // Resolved (and, in doing so, validated) before any write — a path that
  // doesn't resolve to an existing project-docs/ artifact throws here, same
  // as the duplicate check above, so a failing run still has no side effects.
  const projectDocsAncestors = (options.projectDocsAncestors ?? []).map(
    (path) => resolveRefFromPath(host, path),
  );

  ensureContainerReadme(host, containerDir, !!options.project);
  // No fixed expected ancestor type — a blocker can relate to any artifact
  // kind. tracksResolution: true is what makes project-docs-lineage report
  // this blocker as open/resolved.
  ensureArtifactSchemaEntry(host, 'blockers', [], true);

  const content = [
    '---',
    `project-docs-ancestors: [${projectDocsAncestors.join(', ')}]`,
    'resolves: []',
    '---',
    '',
    '<!-- What needs fixing, and why it is blocking. -->',
    '',
  ].join('\n');
  host.write(blockerPath, content);

  await formatFiles(host);
}
