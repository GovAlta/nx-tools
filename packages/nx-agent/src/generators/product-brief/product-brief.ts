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
import { resolveAncestorsAndResolves } from '../../utils/project-docs-refs'
import { Schema } from './schema'

const PRODUCT_BRIEFS_SUBDIR = 'project-docs/product-briefs'
const README_TEMPLATE_PATH = join(__dirname, 'README.template.md')

function resolveTargetRoot(host: Tree, project?: string): string {
  return project ? readProjectConfiguration(host, project).root : '.'
}

export default async function (host: Tree, options: Schema) {
  const targetRoot = resolveTargetRoot(host, options.project)
  const containerDir = joinPathFragments(targetRoot, PRODUCT_BRIEFS_SUBDIR)
  const slug = names(options.name).fileName
  const briefPath = joinPathFragments(containerDir, `${slug}.md`)

  // A repeat/typo'd invocation should fail loudly rather than silently
  // clobbering — same posture as bounded-context and domain-term.
  // Checked before any write so a failing run has no side effects.
  if (host.exists(briefPath)) {
    throw new Error(
      `[nx-agent] ${briefPath} already exists — edit it directly rather than regenerating it.`,
    )
  }

  // Resolved (and validated) before any write — a path that doesn't resolve
  // to an existing project-docs/ artifact throws here.
  const { ancestors: projectDocsAncestors, resolvedRefs } =
    resolveAncestorsAndResolves(
      host,
      options.projectDocsAncestors,
      options.resolves,
    )

  ensureReadme(host, containerDir, readFileSync(README_TEMPLATE_PATH, 'utf-8'))
  ensureArtifactSchemaEntry(host, 'product-briefs', [])

  const content = [
    '---',
    `capability: ${options.name}`,
    'audience: []',
    'known-platforms: []',
    'questions: []',
    `project-docs-ancestors: [${projectDocsAncestors.join(', ')}]`,
    `resolves: [${resolvedRefs.join(', ')}]`,
    '---',
    '',
    '<!-- Product positioning: what this capability is for, who it is for, and what problem it solves. -->',
    '',
  ].join('\n')
  host.write(briefPath, content)

  for (const ref of resolvedRefs) {
    console.log(`✓ this product brief resolves ${ref}`)
  }

  await formatFiles(host)
}
