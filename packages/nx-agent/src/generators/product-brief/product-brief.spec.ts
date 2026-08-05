import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'
import { Tree, addProjectConfiguration } from '@nx/devkit'
import { readArtifactSchema } from '../../utils/artifact-schema'
import generator from './product-brief'

describe('nx-agent product-brief generator', () => {
  let host: Tree

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' })
  })

  it('creates the brief file at the workspace root with the expected frontmatter', async () => {
    await generator(host, { name: 'Lineage Graph' })

    const content = host
      .read('project-docs/product-briefs/lineage-graph.md')
      .toString()
    expect(content).toContain('capability: Lineage Graph')
    expect(content).toContain('audience: []')
    expect(content).toContain('known-platforms: []')
    expect(content).toContain('questions: []')
  })

  it('derives the filename slug from a multi-word name', async () => {
    await generator(host, { name: 'Agent Delivery Harness' })

    expect(
      host.exists('project-docs/product-briefs/agent-delivery-harness.md'),
    ).toBe(true)
  })

  it('creates the container README on first run', async () => {
    await generator(host, { name: 'Lineage Graph' })

    const readme = host
      .read('project-docs/product-briefs/README.md')
      .toString()
    expect(readme).toContain('# Product briefs')
    expect(readme).toContain('nx g @abgov/nx-agent:product-brief')
  })

  it('does not duplicate or alter the README when a second brief is added', async () => {
    await generator(host, { name: 'Lineage Graph' })
    const readmeBefore = host
      .read('project-docs/product-briefs/README.md')
      .toString()

    await generator(host, { name: 'Agent Delivery Harness' })

    const readmeAfter = host
      .read('project-docs/product-briefs/README.md')
      .toString()
    expect(readmeAfter).toBe(readmeBefore)
    expect(
      host.exists('project-docs/product-briefs/lineage-graph.md'),
    ).toBe(true)
    expect(
      host.exists('project-docs/product-briefs/agent-delivery-harness.md'),
    ).toBe(true)
  })

  it('throws and makes no changes when the brief file already exists', async () => {
    await generator(host, { name: 'Lineage Graph' })
    const before = host
      .read('project-docs/product-briefs/lineage-graph.md')
      .toString()

    await expect(
      generator(host, { name: 'Lineage Graph' }),
    ).rejects.toThrow(/already exists/)

    expect(
      host.read('project-docs/product-briefs/lineage-graph.md').toString(),
    ).toBe(before)
  })

  it('scopes the brief file under a specific project when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    })

    await generator(host, {
      name: 'Lineage Graph',
      project: 'domain-lib',
    })

    expect(
      host.exists('libs/domain-lib/project-docs/product-briefs/lineage-graph.md'),
    ).toBe(true)
    expect(
      host.exists('project-docs/product-briefs/lineage-graph.md'),
    ).toBe(false)
  })

  it('registers its own artifact-schema entry with features as the expected ancestor type', async () => {
    await generator(host, { name: 'Lineage Graph' })

    expect(readArtifactSchema(host)).toEqual({
      'product-briefs': { expectedAncestorTypes: ['features'] },
    })
  })

  it('resolves --projectDocsAncestors paths into the canonical reference and writes them', async () => {
    host.write(
      'project-docs/features/include-metadata.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    )

    await generator(host, {
      name: 'Lineage Graph',
      projectDocsAncestors: ['project-docs/features/include-metadata.md'],
    })

    const content = host
      .read('project-docs/product-briefs/lineage-graph.md')
      .toString()
    expect(content).toContain(
      'project-docs-ancestors: [features:include-metadata]',
    )
  })

  it('--resolves writes the resolved ref into both project-docs-ancestors and resolves, and confirms it', async () => {
    host.write(
      'project-docs/open-questions/api-shape.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    )
    const logSpy = jest.spyOn(console, 'log').mockImplementation()

    await generator(host, {
      name: 'Lineage Graph',
      resolves: ['project-docs/open-questions/api-shape.md'],
    })

    const content = host
      .read('project-docs/product-briefs/lineage-graph.md')
      .toString()
    expect(content).toContain(
      'project-docs-ancestors: [open-questions:api-shape]',
    )
    expect(content).toContain('resolves: [open-questions:api-shape]')
    expect(logSpy).toHaveBeenCalledWith(
      '✓ this product brief resolves open-questions:api-shape',
    )
    logSpy.mockRestore()
  })
})
