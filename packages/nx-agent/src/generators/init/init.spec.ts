import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'
import { Tree, readJson } from '@nx/devkit'
import generator from './init'

describe('nx-agent init generator', () => {
  let host: Tree

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' })
  })

  it('adds husky, the prepare script, the pre-commit hook, and the guidance section from scratch', async () => {
    await generator(host, {})

    const pkg = readJson(host, 'package.json')
    expect(pkg.devDependencies.husky).toBeDefined()
    expect(pkg.scripts.prepare).toBe('husky')

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit).toContain(
      "git diff --cached --name-only --diff-filter=ACMR | npx nx affected -t lint,test,build --stdin"
    )

    const agentsMd = host.read('AGENTS.md').toString()
    expect(agentsMd).toContain('<!-- nx-agent:managed:agent-guidance -->')
    expect(agentsMd).toContain('## Working with a coding agent')
    expect(agentsMd).toContain('**Pre-commit checks.**')
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
    expect(agentsMd.split('<!-- nx-agent:managed:agent-guidance -->').length - 1).toBe(1)
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
    expect(agentsMd).toContain('<!-- nx-agent:managed:agent-guidance -->')
  })

  it('exits the check-hook block on failure even once another block follows it', async () => {
    await generator(host, {})

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit).toContain(
      'git diff --cached --name-only --diff-filter=ACMR | npx nx affected -t lint,test,build --stdin || exit 1'
    )
  })

  it('adds secretlint, its config, and the secret-scan hook block from scratch', async () => {
    await generator(host, {})

    const pkg = readJson(host, 'package.json')
    expect(pkg.devDependencies.secretlint).toBeDefined()
    expect(pkg.devDependencies['@secretlint/secretlint-rule-preset-recommend']).toBeDefined()

    const config = readJson(host, '.secretlintrc.json')
    expect(config.rules).toEqual([{ id: '@secretlint/secretlint-rule-preset-recommend' }])

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit).toContain('git diff --cached --name-only --diff-filter=ACMR')
    expect(preCommit).toContain('xargs npx secretlint || exit 1')

    const agentsMd = host.read('AGENTS.md').toString()
    expect(agentsMd).toContain('**Secrets.**')
    expect(agentsMd).toContain('gh auth token')
  })

  it('does not overwrite an existing .secretlintrc.json', async () => {
    host.write('.secretlintrc.json', JSON.stringify({ rules: [{ id: 'custom-rule' }] }))

    await generator(host, {})

    const config = readJson(host, '.secretlintrc.json')
    expect(config.rules).toEqual([{ id: 'custom-rule' }])
  })

  it('keeps both hook blocks and the one consolidated AGENTS.md section non-duplicated on a second run', async () => {
    await generator(host, {})
    await generator(host, {})

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit.split('npx nx affected').length - 1).toBe(1)
    expect(preCommit.split('npx secretlint').length - 1).toBe(1)

    const agentsMd = host.read('AGENTS.md').toString()
    expect(agentsMd.split('<!-- nx-agent:managed:agent-guidance -->').length - 1).toBe(1)
    expect(agentsMd.split('**Pre-commit checks.**').length - 1).toBe(1)
    expect(agentsMd.split('**Secrets.**').length - 1).toBe(1)
    expect(agentsMd.split('**Choosing a dependency.**').length - 1).toBe(1)
  })

  it('preserves an unrelated pre-commit line alongside both generated blocks', async () => {
    host.write('.husky/pre-commit', 'npx lint-staged\n')

    await generator(host, {})

    const preCommit = host.read('.husky/pre-commit').toString()
    expect(preCommit).toContain('npx lint-staged')
    expect(preCommit).toContain('npx nx affected')
    expect(preCommit).toContain('npx secretlint')
  })

  it('creates .gitignore with the baseline credential patterns when missing', async () => {
    await generator(host, {})

    const gitignore = host.read('.gitignore').toString()
    expect(gitignore).toContain('.env.local')
    expect(gitignore).toContain('*.pem')
    expect(gitignore).toContain('id_rsa')
    expect(gitignore).toContain('credentials.json')
    // deliberately not a false positive on a bare .env, which is dual-purpose
    expect(gitignore).not.toMatch(/^\.env$/m)
  })

  it('appends only the missing patterns to an existing .gitignore, preserving its content', async () => {
    host.write('.gitignore', '/dist\n/node_modules\n*.pem\n')

    await generator(host, {})

    const gitignore = host.read('.gitignore').toString()
    expect(gitignore).toContain('/dist')
    expect(gitignore).toContain('/node_modules')
    expect(gitignore.split('*.pem').length - 1).toBe(1)
    expect(gitignore).toContain('.env.local')
    expect(gitignore).toContain('id_rsa')
  })

  it('does not duplicate gitignore entries on a second run', async () => {
    await generator(host, {})
    await generator(host, {})

    const gitignore = host.read('.gitignore').toString()
    expect(gitignore.split('.env.local').length - 1).toBe(1)
    expect(gitignore.split('id_rsa').length - 1).toBe(1)
  })

  it('adds the dependency-choice guidance item without touching package.json or .husky', async () => {
    await generator(host, {})

    const agentsMd = host.read('AGENTS.md').toString()
    expect(agentsMd).toContain('**Choosing a dependency.**')
    expect(agentsMd).toContain('actively-maintained')
    expect(agentsMd).toContain('adds bloat and inconsistency')
    expect(agentsMd).toContain('copyleft')
    expect(agentsMd).toContain('AGPL')

    // guidance-only: no new devDependency, no new hook block, beyond what
    // the check-hook/secret-scan steps already add
    const pkg = readJson(host, 'package.json')
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(
      ['@secretlint/secretlint-rule-preset-recommend', 'husky', 'secretlint'].sort()
    )
  })

  it('assembles all six groups with all twenty items in the correct order', async () => {
    await generator(host, {})

    const agentsMd = host.read('AGENTS.md').toString()

    const groupHeadings = [
      'Security and safety',
      'Dependency hygiene',
      'Verifying your work',
      'Version control practices',
      'Conventions and consistency',
      'Code quality',
    ]
    const itemLabels = [
      'Secrets',
      'PII and sensitive data',
      'Destructive operations',
      'Untrusted content and instructions',
      'Trust boundaries',
      'Choosing a dependency',
      'Pre-commit checks',
      'Style, formatting, and complexity tooling',
      'Atomic, conventional commits',
      'GitHub Flow',
      'Linear history',
      'Ubiquitous language',
      'Project conventions',
      'Framework and library idioms',
      'Scope discipline',
      'Comments: why, not what',
      'Reuse before reinventing',
      'Error handling',
      'TODO transparency',
      'Test quality',
    ]

    const groupIndexes = groupHeadings.map((heading) => {
      const index = agentsMd.indexOf(`### ${heading}`)
      expect(index).toBeGreaterThan(-1)
      return index
    })
    // groups appear in declared order
    for (let i = 1; i < groupIndexes.length; i++) {
      expect(groupIndexes[i]).toBeGreaterThan(groupIndexes[i - 1])
    }

    for (const label of itemLabels) {
      expect(agentsMd).toContain(`**${label}.**`)
    }
  })

  it('migrates an already-init\'d workspace from the old per-capability sections to the one consolidated section', async () => {
    // Simulates AGENTS.md as left by the versions of `init` published before
    // consolidation (check-hook and secret-scan already merged separately).
    host.write(
      'AGENTS.md',
      `# My Project

Some existing stack-specific guidance.

<!-- nx-agent:managed:check-hook -->
## Working with a coding agent — pre-commit checks

Old check-hook wording.
<!-- /nx-agent:managed:check-hook -->

<!-- nx-agent:managed:secret-scan -->
## Working with a coding agent — secret scanning

Old secret-scan wording.
<!-- /nx-agent:managed:secret-scan -->
`
    )

    await generator(host, {})

    const agentsMd = host.read('AGENTS.md').toString()
    // team's own content survives
    expect(agentsMd).toContain('# My Project')
    expect(agentsMd).toContain('Some existing stack-specific guidance.')
    // old markers and wording are gone, not just superseded alongside
    expect(agentsMd).not.toContain('nx-agent:managed:check-hook')
    expect(agentsMd).not.toContain('nx-agent:managed:secret-scan')
    expect(agentsMd).not.toContain('Old check-hook wording.')
    expect(agentsMd).not.toContain('Old secret-scan wording.')
    // exactly one consolidated section with the full new content
    expect(agentsMd.split('<!-- nx-agent:managed:agent-guidance -->').length - 1).toBe(1)
    expect(agentsMd).toContain('**Pre-commit checks.**')
    expect(agentsMd).toContain('**Secrets.**')
    expect(agentsMd).toContain('**Choosing a dependency.**')
  })

  it('creates .claude/settings.json with the default deny patterns from scratch', async () => {
    await generator(host, {})

    const settings = readJson(host, '.claude/settings.json')
    expect(settings.permissions.deny).toEqual(
      expect.arrayContaining([
        'Bash(rm -rf /*)',
        'Bash(rm -rf ~*)',
        'Bash(rm -rf $HOME*)',
        'Bash(sudo:*)',
        'Bash(mkfs:*)',
        'Bash(chmod -R 777 /*)',
        'Bash(shutdown:*)',
        'Bash(reboot:*)',
        'Bash(halt:*)',
        'Bash(poweroff:*)',
        'Bash(git filter-branch:*)',
        'Bash(git filter-repo:*)',
        'Bash(git reflog expire:*)',
        'Bash(git gc *--prune=now*)',
        'Bash(oc delete project:*)',
        'Bash(oc delete namespace:*)',
        'Bash(kubectl delete namespace:*)',
      ])
    )
    expect(settings.permissions.deny).toHaveLength(17)
  })

  it('merges into an existing .claude/settings.json without clobbering other settings', async () => {
    host.write(
      '.claude/settings.json',
      JSON.stringify({
        permissions: {
          allow: ['Bash(npm run test:*)'],
          deny: ['Bash(my-custom-deny:*)'],
        },
        model: 'opus',
      })
    )

    await generator(host, {})

    const settings = readJson(host, '.claude/settings.json')
    expect(settings.model).toBe('opus')
    expect(settings.permissions.allow).toEqual(['Bash(npm run test:*)'])
    expect(settings.permissions.deny).toContain('Bash(my-custom-deny:*)')
    expect(settings.permissions.deny).toContain('Bash(rm -rf /*)')
  })

  it('does not duplicate deny entries on a second run', async () => {
    await generator(host, {})
    await generator(host, {})

    const settings = readJson(host, '.claude/settings.json')
    expect(settings.permissions.deny).toHaveLength(17)
    expect(settings.permissions.deny.filter((p: string) => p === 'Bash(sudo:*)')).toHaveLength(1)
  })
})
