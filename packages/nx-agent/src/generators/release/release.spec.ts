// project-docs-ancestors: cli-designs:release-generator
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'
import { Tree } from '@nx/devkit'
import { readArtifactSchema } from '../../utils/artifact-schema'
import generator from './release'

describe('nx-agent release generator', () => {
  let host: Tree

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' })
  })

  it('creates the release file with the expected frontmatter shape (req-013 rule-1)', async () => {
    host.write(
      'project-docs/features/release-scope.md',
      ['---', 'title: release scope', 'project-docs-ancestors: []', '---'].join(
        '\n',
      ),
    )

    await generator(host, {
      releaseName: 'v1.0',
      projectDocsAncestors: ['project-docs/features/release-scope.md'],
    })

    const content = host
      .read('project-docs/releases/v1-0.md')
      .toString()
    expect(content).toContain('release-name: v1.0')
    expect(content).toContain('project-docs-ancestors: [features:release-scope]')
    expect(content).toContain('Goal statement')
  })

  it('creates the release file with empty ancestors when none are given', async () => {
    await generator(host, { releaseName: 'v2.0' })

    const content = host.read('project-docs/releases/v2-0.md').toString()
    expect(content).toContain('release-name: v2.0')
    expect(content).toContain('project-docs-ancestors: []')
  })

  it('registers releases in artifact-schema.json on first use with expectedAncestorTypes [features] (req-013 rule-2)', async () => {
    await generator(host, { releaseName: 'v1.0' })

    expect(readArtifactSchema(host)).toEqual(
      expect.objectContaining({
        releases: { expectedAncestorTypes: ['features'] },
      }),
    )
  })

  it('is idempotent on schema registration — re-running does not corrupt the schema (req-013 rule-2)', async () => {
    await generator(host, { releaseName: 'v1.0' })
    await generator(host, { releaseName: 'v2.0' })

    const schema = readArtifactSchema(host)
    expect(schema['releases']).toEqual({ expectedAncestorTypes: ['features'] })
  })

  it('throws and writes nothing when the release file already exists (req-013 rule-3)', async () => {
    await generator(host, { releaseName: 'v1.0' })
    const before = host.read('project-docs/releases/v1-0.md').toString()

    await expect(generator(host, { releaseName: 'v1.0' })).rejects.toThrow(
      /already exists/,
    )

    expect(host.read('project-docs/releases/v1-0.md').toString()).toBe(before)
  })

  it('schema.json has x-prompt on releaseName (req-013 rule-4)', () => {
    const schema = require('./schema.json')
    expect(schema.properties.releaseName['x-prompt']).toBeTruthy()
  })

  it('creates the container README on first run', async () => {
    await generator(host, { releaseName: 'v1.0' })

    const readme = host.read('project-docs/releases/README.md').toString()
    expect(readme).toContain('Releases')
    expect(readme).toContain('nx g @abgov/nx-agent:release')
  })

  it('does not overwrite an existing README', async () => {
    host.write('project-docs/releases/README.md', '# custom readme\n')

    await generator(host, { releaseName: 'v1.0' })

    const readme = host.read('project-docs/releases/README.md').toString()
    expect(readme).toBe('# custom readme\n')
  })

  it('throws and writes nothing when a projectDocsAncestors path does not exist', async () => {
    await expect(
      generator(host, {
        releaseName: 'v1.0',
        projectDocsAncestors: ['project-docs/features/nonexistent.md'],
      }),
    ).rejects.toThrow(/not found/)

    expect(host.exists('project-docs/releases/v1-0.md')).toBe(false)
  })
})
