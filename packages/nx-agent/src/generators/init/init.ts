import {
  Tree,
  addDependenciesToPackageJson,
  formatFiles,
  installPackagesTask,
  logger,
  updateJson,
} from '@nx/devkit'
import { mergeManagedSection } from '../../utils/agents-md'
import { NormalizedSchema, Schema } from './schema'

const DEFAULT_TARGETS = ['lint', 'test', 'build']
const DEFAULT_BASE = 'main'
const HUSKY_VERSION = '^9.0.0'
const PRE_COMMIT_PATH = '.husky/pre-commit'
const CHECK_MARKER = 'npx nx affected'

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

function addPreCommitHook(host: Tree, targets: string[]): void {
  const checkLine = `git diff --cached --name-only --diff-filter=ACMR | npx nx affected -t ${targets.join(',')} --stdin`

  if (!host.exists(PRE_COMMIT_PATH)) {
    host.write(PRE_COMMIT_PATH, `${checkLine}\n`)
    return
  }

  const existing = host.read(PRE_COMMIT_PATH).toString()
  if (existing.includes(CHECK_MARKER)) {
    return
  }

  const separator = existing.endsWith('\n') ? '' : '\n'
  host.write(PRE_COMMIT_PATH, `${existing}${separator}${checkLine}\n`)
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

export default async function (host: Tree, rawOptions: Schema) {
  const options = normalizeOptions(rawOptions)

  applyCheckHookStep(host, options)

  await formatFiles(host)

  return () => {
    installPackagesTask(host)
  }
}
