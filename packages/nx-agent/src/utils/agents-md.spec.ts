import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'
import { Tree } from '@nx/devkit'
import { mergeManagedSection } from './agents-md'

describe('mergeManagedSection', () => {
  let host: Tree

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' })
  })

  it('creates AGENTS.md with just the managed section when it does not exist', () => {
    mergeManagedSection(host, 'check-hook', 'Run the check.')

    const content = host.read('AGENTS.md').toString()
    expect(content).toContain('<!-- nx-agent:managed:check-hook -->')
    expect(content).toContain('Run the check.')
    expect(content).toContain('<!-- /nx-agent:managed:check-hook -->')
  })

  it('appends the section when AGENTS.md exists without matching markers', () => {
    host.write('AGENTS.md', '# My Project\n\nSome existing stack-specific guidance.\n')

    mergeManagedSection(host, 'check-hook', 'Run the check.')

    const content = host.read('AGENTS.md').toString()
    expect(content).toContain('# My Project')
    expect(content).toContain('Some existing stack-specific guidance.')
    expect(content).toContain('<!-- nx-agent:managed:check-hook -->')
    expect(content).toContain('Run the check.')
  })

  it('replaces only the content between markers on a second run', () => {
    host.write(
      'AGENTS.md',
      '# My Project\n\nBefore section.\n\n<!-- nx-agent:managed:check-hook -->\nOld content.\n<!-- /nx-agent:managed:check-hook -->\n\nAfter section.\n'
    )

    mergeManagedSection(host, 'check-hook', 'New content.')

    const content = host.read('AGENTS.md').toString()
    expect(content).toContain('Before section.')
    expect(content).toContain('After section.')
    expect(content).toContain('New content.')
    expect(content).not.toContain('Old content.')
    // exactly one pair of markers, not duplicated
    expect(content.split('<!-- nx-agent:managed:check-hook -->')).toHaveLength(2)
  })

  it('does not touch a different managed section with a different id', () => {
    mergeManagedSection(host, 'other-section', 'Other content.')

    mergeManagedSection(host, 'check-hook', 'Check content.')

    const content = host.read('AGENTS.md').toString()
    expect(content).toContain('<!-- nx-agent:managed:other-section -->')
    expect(content).toContain('Other content.')
    expect(content).toContain('<!-- nx-agent:managed:check-hook -->')
    expect(content).toContain('Check content.')
  })
})
