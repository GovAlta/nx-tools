import {
  Tree,
  addDependenciesToPackageJson,
  formatFiles,
  installPackagesTask,
  logger,
  updateJson,
  writeJson,
} from '@nx/devkit'
import { mergeManagedSection } from '../../utils/agents-md'
import { NormalizedSchema, Schema } from './schema'

const DEFAULT_TARGETS = ['lint', 'test', 'build']
const DEFAULT_BASE = 'main'
const HUSKY_VERSION = '^9.0.0'
const SECRETLINT_VERSION = '^13.0.0'
const PRE_COMMIT_PATH = '.husky/pre-commit'
const SECRETLINT_CONFIG_PATH = '.secretlintrc.json'
const AFFECTED_CHECK_MARKER = 'npx nx affected'
const SECRETLINT_MARKER = 'npx secretlint'
const GITIGNORE_PATH = '.gitignore'
// Deliberately excludes bare `.env` — it's dual-purpose (plain workspace
// config as well as secrets; nx-tools' own root .env is a real example of
// the former), so a blanket rule would be a false positive on legitimate use.
const CREDENTIAL_GITIGNORE_PATTERNS = [
  '.env.local',
  '.env.*.local',
  '*.pem',
  '*.key',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
]

function normalizeOptions(options: Schema): NormalizedSchema {
  return {
    targets: options.targets?.length ? options.targets : DEFAULT_TARGETS,
    base: options.base || DEFAULT_BASE,
  }
}

function addHuskyDependency(host: Tree): void {
  // keepExistingVersions=true: skip if a team already pins husky, never bump/clobber their version.
  addDependenciesToPackageJson(host, {}, { husky: HUSKY_VERSION }, undefined, true)
}

function addPrepareScript(host: Tree): void {
  updateJson(host, 'package.json', (pkg) => {
    const scripts = pkg.scripts ?? {}
    if (!scripts.prepare) {
      scripts.prepare = 'husky'
    } else if (!scripts.prepare.includes('husky')) {
      logger.warn(
        `[nx-agent] package.json already has a "prepare" script that doesn't invoke husky ("${scripts.prepare}") — add husky to it manually so the pre-commit hook installs on npm install.`
      )
    }
    pkg.scripts = scripts
    return pkg
  })
}

// Appends an independent, idempotent block to .husky/pre-commit. Each block
// must end its own failure path (e.g. `|| exit 1`) — blocks run sequentially
// and are not aware of each other's exit status, so each is responsible for
// stopping the commit on its own failure rather than relying on a combined
// exit-code scheme that would need rewriting every time a block is added.
function appendHookBlock(host: Tree, marker: string, block: string): void {
  if (!host.exists(PRE_COMMIT_PATH)) {
    host.write(PRE_COMMIT_PATH, `${block}\n`)
    return
  }

  const existing = host.read(PRE_COMMIT_PATH).toString()
  if (existing.includes(marker)) {
    return
  }

  const trimmed = existing.replace(/\n+$/, '')
  host.write(PRE_COMMIT_PATH, `${trimmed}\n\n${block}\n`)
}

function addPreCommitHook(host: Tree, targets: string[]): void {
  const checkLine = `git diff --cached --name-only --diff-filter=ACMR | npx nx affected -t ${targets.join(',')} --stdin || exit 1`
  appendHookBlock(host, AFFECTED_CHECK_MARKER, checkLine)
}

function addAgentsMdGuidance(host: Tree, targets: string[], base: string): void {
  const content = `## Working with a coding agent — pre-commit checks

A pre-commit hook runs \`nx affected\` lint/test/build against your staged changes before every
commit. Don't wait for it to fail: run the same check yourself after a meaningful chunk of work
(a completed feature/story-sized change, not after every individual edit) —

    npx nx affected -t ${targets.join(',')} --base=${base}

— so failures surface while you still have context, not as a batch at commit time. If the
pre-commit hook blocks a commit, fix what it reports rather than bypassing it with
\`git commit --no-verify\`.`

  mergeManagedSection(host, 'check-hook', content)
}

// One step today; the next nx-agent capability gets its own step function
// called from here, rather than reshaping an already-flat generator.
function applyCheckHookStep(host: Tree, options: NormalizedSchema): void {
  addHuskyDependency(host)
  addPrepareScript(host)
  addPreCommitHook(host, options.targets)
  addAgentsMdGuidance(host, options.targets, options.base)
}

function addSecretlintDependencies(host: Tree): void {
  addDependenciesToPackageJson(
    host,
    {},
    {
      secretlint: SECRETLINT_VERSION,
      '@secretlint/secretlint-rule-preset-recommend': SECRETLINT_VERSION,
    },
    undefined,
    true
  )
}

function addSecretlintConfig(host: Tree): void {
  // Team-owned once created — secretlint rules are the kind of thing a team
  // tunes (ignore patterns, extra rules), unlike the AGENTS.md guidance
  // below. Never overwritten on re-run, even if our default content drifts.
  if (host.exists(SECRETLINT_CONFIG_PATH)) {
    return
  }
  writeJson(host, SECRETLINT_CONFIG_PATH, {
    rules: [{ id: '@secretlint/secretlint-rule-preset-recommend' }],
  })
}

function addSecretScanHook(host: Tree): void {
  // secretlint scans the whole cwd recursively when given zero file
  // arguments — it does not no-op — so an empty staged-file list must be
  // guarded explicitly rather than left to xargs's empty-stdin behavior.
  const block = `secretlint_files=$(git diff --cached --name-only --diff-filter=ACMR)
if [ -n "$secretlint_files" ]; then
  echo "$secretlint_files" | xargs npx secretlint || exit 1
fi`
  appendHookBlock(host, SECRETLINT_MARKER, block)
}

function addSecretScanGuidance(host: Tree): void {
  const content = `## Working with a coding agent — secret scanning

A pre-commit hook scans your staged changes for committed credentials (API keys, tokens, private
keys) before every commit. You may have real secrets on hand mid-session — a token from
\`gh auth token\`, a value read from \`.env\`, a key provided for testing — that you might paste
literally if asked to "add a working example," in a way a human wouldn't as instinctively catch in
themselves. Reference an environment variable or a secrets manager instead — never a literal
value, even in a comment or test fixture. If the hook blocks a commit, remove the value and rotate
it if it was ever pushed anywhere; don't just delete the line and recommit.

Local credential files (\`.env.local\`, \`*.pem\`, \`id_rsa\`, etc.) are gitignored by default, so
they can't be staged accidentally — if you create a new kind of local secret file, add its pattern
to \`.gitignore\` too rather than relying on the scan above to catch it after the fact.`

  mergeManagedSection(host, 'secret-scan', content)
}

// Preventive, not detective: once these patterns are in .gitignore, git
// itself refuses to stage a matching file via `git add .`/`git add -A` (a
// deliberate `git add -f` would be needed to override it) — so there's no
// separate pre-commit check needed on top of this for files that match.
// Doesn't help a file that was already tracked before this ran; gitignore
// never retroactively untracks anything.
function ensureGitignoreEntries(host: Tree): void {
  if (!host.exists(GITIGNORE_PATH)) {
    host.write(GITIGNORE_PATH, `${CREDENTIAL_GITIGNORE_PATTERNS.join('\n')}\n`)
    return
  }

  const existing = host.read(GITIGNORE_PATH).toString()
  const existingLines = new Set(existing.split('\n').map((line) => line.trim()))
  const missing = CREDENTIAL_GITIGNORE_PATTERNS.filter((pattern) => !existingLines.has(pattern))
  if (missing.length === 0) {
    return
  }

  const trimmed = existing.replace(/\n+$/, '')
  host.write(GITIGNORE_PATH, `${trimmed}\n\n${missing.join('\n')}\n`)
}

function applySecretScanStep(host: Tree): void {
  addSecretlintDependencies(host)
  addSecretlintConfig(host)
  addSecretScanHook(host)
  ensureGitignoreEntries(host)
  addSecretScanGuidance(host)
}

export default async function (host: Tree, rawOptions: Schema) {
  const options = normalizeOptions(rawOptions)

  applyCheckHookStep(host, options)
  applySecretScanStep(host)

  await formatFiles(host)

  return () => {
    installPackagesTask(host)
  }
}
