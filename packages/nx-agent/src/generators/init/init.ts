import {
  Tree,
  addDependenciesToPackageJson,
  formatFiles,
  installPackagesTask,
  logger,
  updateJson,
  writeJson,
} from '@nx/devkit'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mergeManagedSection, removeManagedSection } from '../../utils/agents-md'
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

const AGENT_GUIDANCE_SECTION_ID = 'agent-guidance'
// One shared section replaced these — kept here only so a re-run against an
// already-init'd workspace cleans them up. Self-migrating: no nx-migrate
// needed, since re-running `init` is already the documented way to pick up
// changes, and this content was already centrally-refreshed, not team-owned.
const LEGACY_GUIDANCE_SECTION_IDS = ['check-hook', 'secret-scan', 'dependency-guidance']

// Guidance content lives in guidance/*.md rather than inline template
// literals — plain markdown previews/renders in an editor or PR diff, and
// needs no backtick-escaping for the inline code the content is full of.
// __dirname-relative, matching the same pattern lib.ts already uses to find
// its own sibling template files; the asset glob in project.json already
// copies non-.ts files under src/ into dist/, so this resolves the same way
// whether running from source (tests) or the compiled package.
function readGuidance(fileName: string, replacements: Record<string, string> = {}): string {
  const raw = readFileSync(join(__dirname, 'guidance', fileName), 'utf-8').trimEnd()
  return Object.entries(replacements).reduce(
    (text, [token, value]) => text.split(`{{${token}}}`).join(value),
    raw
  )
}

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

function checkHookGuidance(targets: string[], base: string): string {
  return readGuidance('check-hook.md', { TARGETS: targets.join(','), BASE: base })
}

// One step today; the next nx-agent capability gets its own step function
// called from here, rather than reshaping an already-flat generator.
function applyCheckHookStep(host: Tree, options: NormalizedSchema): void {
  addHuskyDependency(host)
  addPrepareScript(host)
  addPreCommitHook(host, options.targets)
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

function secretScanGuidance(): string {
  return readGuidance('secret-scan.md')
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
}

// Guidance only — no hook, no new dependency. Licensing has mature
// deterministic tooling too (e.g. license-checker), but pairing a blocking
// check with this is a separate decision from the guidance requested here.
function dependencyGuidance(): string {
  return readGuidance('dependency-guidance.md')
}

// Every capability contributes one subsection here instead of writing its
// own top-level AGENTS.md section, so the growing list of practices reads as
// one coherent "working with a coding agent" reference rather than an
// ever-longer flat list of H2s competing with the rest of AGENTS.md.
function applyAgentGuidance(host: Tree, options: NormalizedSchema): void {
  for (const legacyId of LEGACY_GUIDANCE_SECTION_IDS) {
    removeManagedSection(host, legacyId)
  }

  const subsections = [
    checkHookGuidance(options.targets, options.base),
    secretScanGuidance(),
    dependencyGuidance(),
  ]

  const content = `## Working with a coding agent\n\n${subsections.join('\n\n')}`
  mergeManagedSection(host, AGENT_GUIDANCE_SECTION_ID, content)
}

export default async function (host: Tree, rawOptions: Schema) {
  const options = normalizeOptions(rawOptions)

  applyCheckHookStep(host, options)
  applySecretScanStep(host)
  applyAgentGuidance(host, options)

  await formatFiles(host)

  return () => {
    installPackagesTask(host)
  }
}
