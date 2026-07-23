import { Tree, formatFiles, joinPathFragments, names, readProjectConfiguration } from '@nx/devkit'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Schema } from './schema'

const DOMAIN_TERMS_SUBDIR = 'project-docs/domain-terms'
const README_TEMPLATE_PATH = join(__dirname, 'README.template.md')

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.'
}

// The container has no standalone value on its own (its README only exists to
// explain the convention for the term about to be added), so this is an
// internal step composed by domain-term rather than its own generator.
function ensureContainerReadme(host: Tree, containerDir: string, scoped: boolean): void {
  const readmePath = joinPathFragments(containerDir, 'README.md')
  if (host.exists(readmePath)) {
    return
  }
  const sharedNote = scoped
    ? ' This is shared by every project that depends on this library — keep the vocabulary consistent across the service and its frontends rather than letting each drift toward its own terms.'
    : ''
  const content = readFileSync(README_TEMPLATE_PATH, 'utf-8')
    .split('{{SHARED_CONTEXT_NOTE}}')
    .join(sharedNote)
  host.write(readmePath, content)
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project)
  const containerDir = joinPathFragments(targetRoot, DOMAIN_TERMS_SUBDIR)
  const slug = names(options.term).fileName
  const termPath = joinPathFragments(containerDir, `${slug}.md`)

  // A repeat/typo'd invocation should fail loudly rather than silently
  // clobbering or duplicating a term — unlike the "never overwrite, skip
  // silently" posture used for one-shot config like .secretlintrc.json,
  // re-adding an existing term is almost always a mistake, not an
  // idempotent re-run. Checked before ensureContainerReadme so a failing
  // run has no side effects.
  if (host.exists(termPath)) {
    throw new Error(
      `[nx-agent] ${termPath} already exists — edit it directly rather than regenerating it.`
    )
  }

  ensureContainerReadme(host, containerDir, !!options.project)

  const content = [
    '---',
    `term: ${options.term}`,
    'aliases: []',
    'not_confused_with: []',
    '---',
    '',
    "<!-- Definition: describe this term in the domain's own language. -->",
    '',
  ].join('\n')
  host.write(termPath, content)

  await formatFiles(host)
}
