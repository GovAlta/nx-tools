import { Tree, getProjects, logger, readJson, writeJson } from '@nx/devkit'

function projectDocsRoots(host: Tree): string[] {
  const roots = ['project-docs']
  for (const [, config] of getProjects(host)) {
    roots.push(
      config.root === '.' ? 'project-docs' : `${config.root}/project-docs`,
    )
  }
  return [...new Set(roots)].filter((root) => host.exists(root))
}

// Rewrite every `service-descriptions:` token in frontmatter and body of .md
// files under a project-docs root to `product-briefs:`.
function rewriteRefsInDocsRoot(host: Tree, docsRoot: string): number {
  let count = 0
  for (const typeDir of host.children(docsRoot)) {
    const typePath = `${docsRoot}/${typeDir}`
    if (host.isFile(typePath)) {
      // singular artifact at project-docs/<type>.md
      if (typeDir.endsWith('.md') && typeDir !== 'README.md') {
        const content = host.read(typePath, 'utf-8') ?? ''
        if (content.includes('service-descriptions:')) {
          host.write(
            typePath,
            content.split('service-descriptions:').join('product-briefs:'),
          )
          count++
        }
      }
      continue
    }
    for (const file of host.children(typePath)) {
      const filePath = `${typePath}/${file}`
      if (!host.isFile(filePath) || !file.endsWith('.md') || file === 'README.md')
        continue
      const content = host.read(filePath, 'utf-8') ?? ''
      if (content.includes('service-descriptions:')) {
        host.write(
          filePath,
          content.split('service-descriptions:').join('product-briefs:'),
        )
        count++
      }
    }
  }
  return count
}

// Rename service-descriptions/ → product-briefs/, converting `service: X`
// frontmatter key to `capability: X` in each moved file.
function moveServiceDescriptions(host: Tree, docsRoot: string): number {
  const sourceDir = `${docsRoot}/service-descriptions`
  if (!host.exists(sourceDir)) return 0

  const targetDir = `${docsRoot}/product-briefs`
  let moved = 0

  for (const file of host.children(sourceDir)) {
    const srcPath = `${sourceDir}/${file}`
    if (!host.isFile(srcPath)) continue
    if (file === 'README.md') {
      host.delete(srcPath)
      continue
    }
    if (!file.endsWith('.md')) continue

    const content = host.read(srcPath, 'utf-8') ?? ''
    // Rename the `service:` frontmatter key to `capability:` — only the first
    // occurrence in the file (always in the frontmatter block).
    const updated = content.replace(/^service:/m, 'capability:')
    host.write(`${targetDir}/${file}`, updated)
    host.delete(srcPath)
    moved++
  }

  return moved
}

// Update artifact-schema.json at the workspace root: rename service-descriptions
// to product-briefs and update requirements' expectedAncestorTypes.
function updateArtifactSchema(host: Tree, docsRoot: string): void {
  const schemaPath = `${docsRoot}/artifact-schema.json`
  if (!host.exists(schemaPath)) return

  const schema = readJson<Record<string, { expectedAncestorTypes: string[] }>>(
    host,
    schemaPath,
  )

  if ('service-descriptions' in schema) {
    schema['product-briefs'] = schema['service-descriptions']
    delete schema['service-descriptions']
  }

  for (const entry of Object.values(schema)) {
    if (Array.isArray(entry.expectedAncestorTypes)) {
      entry.expectedAncestorTypes = entry.expectedAncestorTypes.map((t) =>
        t === 'service-descriptions' ? 'product-briefs' : t,
      )
    }
  }

  writeJson(host, schemaPath, schema)
}

export default async function renameServiceDescriptionsToProductBriefs(
  host: Tree,
): Promise<void> {
  let totalMoved = 0
  let totalUpdated = 0

  for (const docsRoot of projectDocsRoots(host)) {
    totalMoved += moveServiceDescriptions(host, docsRoot)
    totalUpdated += rewriteRefsInDocsRoot(host, docsRoot)
    updateArtifactSchema(host, docsRoot)
  }

  if (totalMoved > 0) {
    logger.info(
      `[nx-agent] Moved ${totalMoved} file(s) from service-descriptions/ to product-briefs/.`,
    )
  }
  if (totalUpdated > 0) {
    logger.info(
      `[nx-agent] Updated service-descriptions: refs in ${totalUpdated} file(s).`,
    )
  }
  if (totalMoved === 0 && totalUpdated === 0) {
    logger.info('[nx-agent] No service-descriptions/ directories found; nothing to migrate.')
  }
}
