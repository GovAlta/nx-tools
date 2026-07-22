import { Tree } from '@nx/devkit'

const AGENTS_MD_PATH = 'AGENTS.md'

function getMarkers(sectionId: string) {
  return {
    start: `<!-- nx-agent:managed:${sectionId} -->`,
    end: `<!-- /nx-agent:managed:${sectionId} -->`,
  }
}

/**
 * Upserts a marker-bounded section into AGENTS.md. Content generated once by
 * nx-adsp's own stack templates is team-owned after that — this is the
 * deliberate exception: content that doesn't vary by stack is safe to
 * refresh on every re-run rather than freeze at first-generation wording.
 */
export function mergeManagedSection(host: Tree, sectionId: string, content: string): void {
  const { start, end } = getMarkers(sectionId)
  const block = `${start}\n${content.trim()}\n${end}`

  if (!host.exists(AGENTS_MD_PATH)) {
    host.write(AGENTS_MD_PATH, `${block}\n`)
    return
  }

  const existing = host.read(AGENTS_MD_PATH).toString()
  const startIndex = existing.indexOf(start)
  const endIndex = existing.indexOf(end)

  if (startIndex !== -1 && endIndex !== -1) {
    const before = existing.slice(0, startIndex)
    const after = existing.slice(endIndex + end.length)
    host.write(AGENTS_MD_PATH, `${before}${block}${after}`)
    return
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  host.write(AGENTS_MD_PATH, `${existing}${separator}${block}\n`)
}

/**
 * Removes a marker-bounded section entirely, if present. Self-migration
 * primitive: when a set of managed sections gets restructured (e.g.
 * consolidated under one shared heading), call this for each superseded
 * section id before writing the replacement — no nx-migrate/migrations.json
 * needed, since this content was already established as centrally-refreshed
 * rather than team-owned, and init is meant to be re-run to pick up changes.
 */
export function removeManagedSection(host: Tree, sectionId: string): void {
  if (!host.exists(AGENTS_MD_PATH)) {
    return
  }

  const { start, end } = getMarkers(sectionId)
  const existing = host.read(AGENTS_MD_PATH).toString()
  const startIndex = existing.indexOf(start)
  const endIndex = existing.indexOf(end)

  if (startIndex === -1 || endIndex === -1) {
    return
  }

  const before = existing.slice(0, startIndex)
  const after = existing.slice(endIndex + end.length)
  const combined = `${before}${after}`.replace(/\n{3,}/g, '\n\n')
  host.write(AGENTS_MD_PATH, combined)
}
