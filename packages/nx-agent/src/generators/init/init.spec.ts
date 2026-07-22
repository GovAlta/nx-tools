import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'
import { Tree, readJson } from '@nx/devkit'
import generator from './init'

describe('nx-agent init generator', () => {
  let host: Tree

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' })
  })

  it('adds husky, the prepare script, the pre-commit hook, and the AGENTS.md section from scratch', async () => {
    await generator(host, {})

    const pkg = readJson(host, 'package.json')
    expect(pkg.devDependencies.husky).toBeDefined()
    expect(pkg.scripts.prepare).toBe('husky')

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit).toContain(
      "git diff --cached --name-only --diff-filter=ACMR | npx nx affected -t lint,test,build --stdin"
    )

    const agentsMd = host.read('AGENTS.md').toString()
    expect(agentsMd).toContain('<!-- nx-agent:managed:check-hook -->')
    expect(agentsMd).toContain('npx nx affected -t lint,test,build --base=main')
    expect(agentsMd).toContain('git commit --no-verify')
  })

  it('does not clobber an existing husky pin', async () => {
    const pkg = readJson(host, 'package.json')
    pkg.devDependencies.husky = '8.0.0'
    host.write('package.json', JSON.stringify(pkg))

    await generator(host, {})

    expect(readJson(host, 'package.json').devDependencies.husky).toBe('8.0.0')
  })

  it('preserves an unrelated pre-commit line and appends the check line once', async () => {
    host.write('.husky/pre-commit', 'npx lint-staged\n')

    await generator(host, {})

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit).toContain('npx lint-staged')
    expect(preCommit).toContain('npx nx affected')
    expect(preCommit.split('npx nx affected').length - 1).toBe(1)
  })

  it('is idempotent on a second run', async () => {
    await generator(host, {})
    await generator(host, {})

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit.split('npx nx affected').length - 1).toBe(1)

    const pkg = readJson(host, 'package.json')
    expect(Object.keys(pkg.devDependencies).filter((k) => k === 'husky')).toHaveLength(1)

    const agentsMd = host.read('AGENTS.md').toString()
    expect(agentsMd.split('<!-- nx-agent:managed:check-hook -->').length - 1).toBe(1)
  })

  it('warns and leaves an unrelated prepare script untouched', async () => {
    const pkg = readJson(host, 'package.json')
    pkg.scripts = { prepare: 'echo custom' }
    host.write('package.json', JSON.stringify(pkg))

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation()

    await generator(host, {})

    expect(readJson(host, 'package.json').scripts.prepare).toBe('echo custom')
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('respects a custom targets list in both the hook and the AGENTS.md guidance', async () => {
    await generator(host, { targets: ['lint', 'test'] })

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit).toContain('-t lint,test --stdin')

    const agentsMd = host.read('AGENTS.md').toString()
    expect(agentsMd).toContain('-t lint,test --base=main')
  })

  it('respects a custom base branch in the AGENTS.md guidance only', async () => {
    await generator(host, { base: 'develop' })

    const agentsMd = host.read('AGENTS.md').toString()
    expect(agentsMd).toContain('--base=develop')

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit).not.toContain('develop')
  })

  it('appends to an existing AGENTS.md without disturbing its content', async () => {
    host.write('AGENTS.md', '# My Project\n\nSome existing stack-specific guidance.\n')

    await generator(host, {})

    const agentsMd = host.read('AGENTS.md').toString()
    expect(agentsMd).toContain('# My Project')
    expect(agentsMd).toContain('Some existing stack-specific guidance.')
    expect(agentsMd).toContain('<!-- nx-agent:managed:check-hook -->')
  })
})
