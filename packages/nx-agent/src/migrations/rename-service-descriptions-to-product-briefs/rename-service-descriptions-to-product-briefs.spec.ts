import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'
import { Tree, addProjectConfiguration } from '@nx/devkit'
import migration from './rename-service-descriptions-to-product-briefs'

describe('rename-service-descriptions-to-product-briefs migration', () => {
  let host: Tree

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' })
  })

  it('moves service-descriptions/ files to product-briefs/', async () => {
    host.write('project-docs/service-descriptions/lineage-graph.md', '---\nservice: Lineage Graph\nproject-docs-ancestors: [features:foo]\n---\n')

    await migration(host)

    expect(host.exists('project-docs/product-briefs/lineage-graph.md')).toBe(true)
    expect(host.exists('project-docs/service-descriptions/lineage-graph.md')).toBe(false)
  })

  it('renames `service:` frontmatter key to `capability:` in moved files', async () => {
    host.write(
      'project-docs/service-descriptions/lineage-graph.md',
      '---\nservice: Lineage Graph\naudience: [agents]\n---\n\nBody text.\n',
    )

    await migration(host)

    const content = host.read('project-docs/product-briefs/lineage-graph.md', 'utf-8')
    expect(content).toContain('capability: Lineage Graph')
    expect(content).not.toContain('service: Lineage Graph')
    expect(content).toContain('audience: [agents]')
    expect(content).toContain('Body text.')
  })

  it('rewrites service-descriptions: refs in other .md files under project-docs/', async () => {
    host.write(
      'project-docs/service-descriptions/lineage-graph.md',
      '---\nservice: Lineage Graph\nproject-docs-ancestors: [features:foo]\n---\n',
    )
    host.write(
      'project-docs/requirements/my-req.md',
      '---\ntitle: My Req\nproject-docs-ancestors:\n  - service-descriptions:lineage-graph\n---\n',
    )

    await migration(host)

    const reqContent = host.read('project-docs/requirements/my-req.md', 'utf-8')
    expect(reqContent).toContain('product-briefs:lineage-graph')
    expect(reqContent).not.toContain('service-descriptions:lineage-graph')
  })

  it('updates artifact-schema.json: renames the type key and fixes requirements.expectedAncestorTypes', async () => {
    host.write(
      'project-docs/service-descriptions/lineage-graph.md',
      '---\nservice: Lineage Graph\nproject-docs-ancestors: [features:foo]\n---\n',
    )
    host.write(
      'project-docs/artifact-schema.json',
      JSON.stringify({
        features: { expectedAncestorTypes: [] },
        'service-descriptions': { expectedAncestorTypes: ['features'] },
        requirements: { expectedAncestorTypes: ['service-descriptions'] },
        'bounded-contexts': { expectedAncestorTypes: [] },
      }),
    )

    await migration(host)

    const schema = JSON.parse(
      host.read('project-docs/artifact-schema.json', 'utf-8') ?? '{}',
    )
    expect(schema['product-briefs']).toEqual({ expectedAncestorTypes: ['features'] })
    expect(schema['service-descriptions']).toBeUndefined()
    expect(schema['requirements'].expectedAncestorTypes).toEqual(['product-briefs'])
    expect(schema['features']).toEqual({ expectedAncestorTypes: [] })
    expect(schema['bounded-contexts']).toEqual({ expectedAncestorTypes: [] })
  })

  it('deletes the container README without copying it to product-briefs/', async () => {
    host.write('project-docs/service-descriptions/README.md', '# Service descriptions\n')
    host.write(
      'project-docs/service-descriptions/lineage-graph.md',
      '---\nservice: Lineage Graph\nproject-docs-ancestors: [features:foo]\n---\n',
    )

    await migration(host)

    expect(host.exists('project-docs/service-descriptions/README.md')).toBe(false)
    expect(host.exists('project-docs/product-briefs/README.md')).toBe(false)
  })

  it('is a no-op when no service-descriptions/ directory exists', async () => {
    host.write('project-docs/features/my-feature.md', '---\nproject-docs-ancestors: []\n---\n')

    await expect(migration(host)).resolves.toBeUndefined()
    expect(host.exists('project-docs/product-briefs')).toBe(false)
  })

  it('migrates a project-scoped service-descriptions/ directory', async () => {
    addProjectConfiguration(host, 'my-lib', {
      root: 'libs/my-lib',
      projectType: 'library',
      targets: {},
    })
    host.write(
      'libs/my-lib/project-docs/service-descriptions/my-service.md',
      '---\nservice: My Service\nproject-docs-ancestors: [features:bar]\n---\n',
    )
    host.write(
      'libs/my-lib/project-docs/requirements/req.md',
      '---\nproject-docs-ancestors:\n  - service-descriptions:my-service\n---\n',
    )

    await migration(host)

    expect(
      host.exists('libs/my-lib/project-docs/product-briefs/my-service.md'),
    ).toBe(true)
    const content = host.read(
      'libs/my-lib/project-docs/product-briefs/my-service.md',
      'utf-8',
    )
    expect(content).toContain('capability: My Service')
    const req = host.read('libs/my-lib/project-docs/requirements/req.md', 'utf-8')
    expect(req).toContain('product-briefs:my-service')
  })

  it('handles multiple service-descriptions files in one pass', async () => {
    host.write(
      'project-docs/service-descriptions/lineage-graph.md',
      '---\nservice: Lineage Graph\nproject-docs-ancestors: [features:foo]\n---\n',
    )
    host.write(
      'project-docs/service-descriptions/agent-delivery-harness.md',
      '---\nservice: Agent Delivery Harness\nproject-docs-ancestors: [features:bar]\n---\n',
    )

    await migration(host)

    expect(host.exists('project-docs/product-briefs/lineage-graph.md')).toBe(true)
    expect(host.exists('project-docs/product-briefs/agent-delivery-harness.md')).toBe(true)
    expect(host.exists('project-docs/service-descriptions')).toBe(false)
  })
})
