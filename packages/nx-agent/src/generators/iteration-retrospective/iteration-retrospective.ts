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
import { resolveAncestorsAndResolves } from '../../utils/project-docs-refs';
import { Schema } from './schema';

const ITERATION_RETROSPECTIVES_SUBDIR = 'project-docs/iteration-retrospectives';
const README_TEMPLATE_PATH = join(__dirname, 'README.template.md');

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.';
}

// The container has no standalone value on its own (its README only exists to
// explain the convention for the retrospective about to be added), so this is
// an internal step composed by iteration-retrospective rather than its own
// generator.
function ensureContainerReadme(
  host: Tree,
  containerDir: string,
  scoped: boolean,
): void {
  const sharedNote = scoped
    ? ' This is shared by every project that depends on this library — a pass against the shared code affects every consumer, not just the one that ran it.'
    : '';
  const content = readFileSync(README_TEMPLATE_PATH, 'utf-8')
    .split('{{SHARED_CONTEXT_NOTE}}')
    .join(sharedNote);
  ensureReadme(host, containerDir, content);
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project);
  const containerDir = joinPathFragments(
    targetRoot,
    ITERATION_RETROSPECTIVES_SUBDIR,
  );
  const slug = names(options.title).fileName;
  const retrospectivePath = joinPathFragments(containerDir, `${slug}.md`);

  // A repeat/typo'd invocation should fail loudly rather than silently
  // clobbering or duplicating a retrospective — same posture as domain-model.
  // Checked before any write so a failing run has no side effects.
  if (host.exists(retrospectivePath)) {
    throw new Error(
      `[nx-agent] ${retrospectivePath} already exists — edit it directly rather than regenerating it.`,
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
  // expectedAncestorTypes: [] deliberately unconstrained — an iteration's own
  // coverage varies pass to pass by design, unlike domain-terms/domain-models
  // which always expect the same fixed ancestor types. terminal: true is what
  // keeps a correctly-closed-out retrospective (zero descendants by design)
  // from being reported as an orphan alongside a genuine dead-end.
  ensureArtifactSchemaEntry(
    host,
    'iteration-retrospectives',
    [],
    undefined,
    true,
  );

  const content = [
    '---',
    `title: ${options.title}`,
    `project-docs-ancestors: [${projectDocsAncestors.join(', ')}]`,
    `resolves: [${resolvedRefs.join(', ')}]`,
    '---',
    '',
    '<!-- Free-text body: what this pass did, what was found and fixed along the way, and an',
    '     explicit status when "deployment succeeded" and "verified working end-to-end" diverge. -->',
    '',
  ].join('\n');
  host.write(retrospectivePath, content);

  for (const ref of resolvedRefs) {
    console.log(`✓ this iteration retrospective resolves ${ref}`);
  }

  await formatFiles(host);
}
