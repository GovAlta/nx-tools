// project-docs-ancestors: cli-designs:release-generator
import {
  Tree,
  formatFiles,
  joinPathFragments,
  names,
  readProjectConfiguration,
} from '@nx/devkit'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ensureArtifactSchemaEntry } from '../../utils/artifact-schema'
import { ensureReadme } from '../../utils/readme'
import {
  resolveAncestorsAndResolves,
  validateProjectDocsSlug,
} from '../../utils/project-docs-refs'
import { Schema } from './schema'

const RELEASES_SUBDIR = 'project-docs/releases'
const README_TEMPLATE_PATH = join(__dirname, 'README.template.md')

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.'
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project)
  const containerDir = joinPathFragments(targetRoot, RELEASES_SUBDIR)
  // Release names like "v1.0" contain dots that are invalid in project-docs
  // slugs — replace any non-alphanumeric, non-hyphen, non-underscore char with
  // a hyphen and then collapse runs of hyphens so "v1.0" → "v1-0".
  const rawSlug = names(options.releaseName).fileName
  const slug = rawSlug.replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
  validateProjectDocsSlug(slug, options.releaseName)
  const releasePath = joinPathFragments(containerDir, `${slug}.md`)

  if (host.exists(releasePath)) {
    throw new Error(
      `[nx-agent] ${releasePath} already exists — edit it directly rather than regenerating it.`,
    )
  }

  const { ancestors: projectDocsAncestors } = resolveAncestorsAndResolves(
    host,
    options.projectDocsAncestors,
    undefined,
  )

  const readmeContent = readFileSync(README_TEMPLATE_PATH, 'utf-8')
  ensureReadme(host, containerDir, readmeContent)
  ensureArtifactSchemaEntry(host, 'releases', ['features'], { terminal: true, permanent: true })

  const content = [
    '---',
    `release-name: ${options.releaseName}`,
    `project-docs-ancestors: [${projectDocsAncestors.join(', ')}]`,
    '---',
    '',
    '<!-- Goal statement: what a developer can do when this release ships.',
    '     Example: "A developer can scaffold a release-scoped workspace with',
    '     a single command that creates the project-docs/releases/ entry and',
    '     the CI harness picks it up automatically." -->',
    '',
  ].join('\n')
  host.write(releasePath, content)

  await formatFiles(host)
}
