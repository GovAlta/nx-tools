// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync } from 'child_process';
import { redact } from '../core/redact';
import { GitFailure } from './git';

/**
 * Why a fetch failed, in the one sentence a caller can act on.
 *
 * req-006 rule 7 asks that a failure name the access required rather than relay a transport error,
 * because a new person reading one concludes the package is broken. That is all it asks.
 *
 * AN EARLIER VERSION OF THIS WAS EIGHT ROWS with SSH probing and authenticated API calls to tell
 * "no access" from "no such repository" from "no such ref". Each row was individually defensible
 * and the whole was a diagnostic subsystem inside a file-copier — 149 lines answering one rule.
 * Three rows cover the cases a caller can do anything about; anything else is relayed honestly,
 * which rule 7's second example sanctions explicitly.
 */

function present(command: string): boolean {
  try {
    execFileSync(command, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function diagnose(failure: GitFailure): string {
  if (!present('git')) {
    return (
      'git is not on PATH, and the harness source is fetched with it. ' +
      'Install git, or pass --source <path> to place from a local clone.'
    );
  }

  if (!present('gh')) {
    return (
      'Reaching the harness source needs git credentials for github.com. ' +
      "Install the GitHub CLI (https://cli.github.com), run 'gh auth login', then " +
      "'gh auth setup-git'. If this machine already has credentials another way, the failure " +
      `was: ${redact(failure.output)}`
    );
  }

  // gh is present, so the likeliest remaining cause is which account is active — a lesson this
  // suite already paid for: `gh auth status` succeeding proves only that SOME account is logged
  // in, not that the active one can see the repository. Both halves redacted, because git echoes
  // the credential it was given even though this package never reads one.
  return (
    `${redact(failure.command)} failed: ${redact(failure.output)}\n` +
    "If this is an access problem, check which account is active with 'gh auth status' and " +
    "switch with 'gh auth switch' — access to the harness source repository is what this " +
    'installer needs, and nothing else. Run `gh auth setup-git` if git is not wired to use it.'
  );
}
