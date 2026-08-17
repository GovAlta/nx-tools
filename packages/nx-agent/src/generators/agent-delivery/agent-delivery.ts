import {
  Tree,
  addDependenciesToPackageJson,
  joinPathFragments,
} from '@nx/devkit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mergeManagedSection } from '../../utils/agents-md';
import { provisionGithubActionsSecrets } from './provision-github-secrets';
import { Schema } from './schema';

const FILES_DIR = join(__dirname, 'files');
const AGENTS_MD_SECTION_ID = 'agent-delivery';
const YAML_VERSION = '~2.9.0';

// The four skill files, the harness scripts, and the workflow are meant to be
// read once and then adapted by whoever's driving a given flow (the DDDD
// skills are explicitly "hand-authored the same way until it's proven and
// promoted" in spirit) — copied in, not centrally managed. Write-if-missing
// so a team's own edits survive a re-run; there's no existing nx-agent/nx-adsp
// utility for "copy a tree, skip files that already exist" (every current
// generateFiles usage overwrites unconditionally), so this is deliberately a
// flat list of [source, target] pairs rather than a generic directory walk.
function copyIfMissing(host: Tree, srcPath: string, destPath: string): void {
  if (host.exists(destPath)) {
    return;
  }
  host.write(destPath, readFileSync(srcPath, 'utf-8'));
}

const SKILL_STAGES = ['discover', 'design', 'develop', 'deploy'] as const;

function addSkillFiles(host: Tree): void {
  for (const stage of SKILL_STAGES) {
    copyIfMissing(
      host,
      join(FILES_DIR, 'skills', stage, 'SKILL.md'),
      joinPathFragments('.claude', 'skills', stage, 'SKILL.md'),
    );
  }
}

function addBaseScripts(host: Tree): void {
  copyIfMissing(
    host,
    join(FILES_DIR, 'scripts', 'check-example-mapping.mjs'),
    joinPathFragments('scripts', 'check-example-mapping.mjs'),
  );
}

const GITHUB_ACTIONS_SCRIPTS = [
  'run-agent-delivery-iteration.sh',
  'register-mcp-servers.sh',
  'ensure-completion-pr.sh',
  'dispatch-next-iteration.sh',
  'task-identification.mjs',
];

function addGithubActionsFiles(host: Tree): void {
  for (const script of GITHUB_ACTIONS_SCRIPTS) {
    copyIfMissing(
      host,
      join(FILES_DIR, 'github-actions', 'scripts', script),
      joinPathFragments('scripts', script),
    );
  }
  copyIfMissing(
    host,
    join(
      FILES_DIR,
      'github-actions',
      'workflows',
      'agent-delivery-iteration.yml',
    ),
    joinPathFragments('.github', 'workflows', 'agent-delivery-iteration.yml'),
  );
  copyIfMissing(
    host,
    join(FILES_DIR, 'github-actions', 'learnings', 'learnings.md'),
    joinPathFragments('.github', 'agent-delivery-iteration', 'learnings.md'),
  );
  copyIfMissing(
    host,
    join(FILES_DIR, 'github-actions', 'learnings', 'gitignore'),
    joinPathFragments('.github', 'agent-delivery-iteration', '.gitignore'),
  );
  copyIfMissing(
    host,
    join(FILES_DIR, 'github-actions', 'skills', 'handoff', 'SKILL.md'),
    joinPathFragments('.claude', 'skills', 'handoff', 'SKILL.md'),
  );
}

function readGuidance(githubActions: boolean): string {
  const skills = readFileSync(join(FILES_DIR, 'AGENTS.guidance.md'), 'utf-8').trim();
  if (!githubActions) return skills;
  const harness = readFileSync(join(FILES_DIR, 'AGENTS.ci-harness.md'), 'utf-8').trim();
  return `${skills}\n\n${harness}`;
}

export default async function (host: Tree, options: Schema) {
  addSkillFiles(host);
  addBaseScripts(host);
  // check-example-mapping.mjs parses YAML frontmatter — a real dependency of
  // the *consuming* workspace, not just of @abgov/nx-agent itself. Dev-only:
  // this script is a Discover-stage gate, never part of a deployed bundle.
  addDependenciesToPackageJson(host, {}, { yaml: YAML_VERSION });

  if (options.githubActions) {
    addGithubActionsFiles(host);
  }

  mergeManagedSection(host, AGENTS_MD_SECTION_ID, readGuidance(options.githubActions ?? false));

  // Last, and independent of everything above: file scaffolding always succeeds regardless of
  // what live oc/gh/ADSP calls this finds. No-ops entirely unless both --githubActions and
  // --provisionSecrets are set — see provision-github-secrets.ts's own header for the full design.
  await provisionGithubActionsSecrets(host, options);
}
