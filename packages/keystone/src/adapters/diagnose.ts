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

/**
 * Whether any GitHub account is authenticated.
 *
 * `gh auth status`, NOT `gh auth token`: the token form returns the secret as a string into this
 * process, and "no credential is ever held" is what makes three of
 * requirements:never-persist-or-emit-the-source-credential's rules structural. Status answers the
 * same yes/no, and it is the command the remediation names.
 */
function anyAccountAuthenticated(): boolean {
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * What the machine has, as three booleans.
 *
 * A seam, and its absence is why the restored row below could not be tested at first: the trimmed
 * version detected inline, so a test could only exercise whichever row this machine happens to
 * land on. Detected by default, injectable for a test — small enough to stay honest, since each
 * value is one command's exit code.
 */
export interface Environment {
  readonly gitPresent: boolean;
  readonly ghPresent: boolean;
  readonly ghAuthenticated: boolean;
}

export function detectEnvironment(): Environment {
  const ghPresent = present('gh');
  return {
    gitPresent: present('git'),
    ghPresent,
    ghAuthenticated: ghPresent && anyAccountAuthenticated(),
  };
}

export function diagnose(
  failure: GitFailure,
  environment: Environment = detectEnvironment(),
): string {
  if (!environment.gitPresent) {
    return (
      'git is not on PATH, and the harness source is fetched with it. ' +
      'Install git, or pass --source <path> to place from a local clone.'
    );
  }

  if (!environment.ghPresent) {
    return (
      'Reaching the harness source needs git credentials for github.com. ' +
      "Install the GitHub CLI (https://cli.github.com), run 'gh auth login', then " +
      "'gh auth setup-git'. If this machine already has credentials another way, the failure " +
      `was: ${redact(failure.output)}`
    );
  }

  // gh is present but nobody is logged in. Distinguished from the row below because the advice is
  // different and the wrong one is a dead end: telling someone to `gh auth switch` when there is
  // no account to switch to sends them looking for something that does not exist. This row was cut
  // when the diagnosis was trimmed from eight rows to three, and restoring it is the whole reason
  // four is the right number rather than three.
  if (!environment.ghAuthenticated) {
    return (
      'No GitHub account is authenticated, and reaching the harness source needs credentials for ' +
      "github.com. Run 'gh auth login' as an account with access to it, then 'gh auth setup-git'."
    );
  }

  // Logged in, so the likeliest remaining cause is WHICH account — a lesson this suite already
  // paid for: `gh auth status` succeeding proves only that some account is logged in, not that the
  // active one can see the repository. Both halves redacted, because git echoes the credential it
  // was given even though this package never reads one.
  return (
    `${redact(failure.command)} failed: ${redact(failure.output)}\n` +
    "If this is an access problem, check which account is active with 'gh auth status' and " +
    "switch with 'gh auth switch' — access to the harness source repository is what this " +
    'installer needs, and nothing else. Run `gh auth setup-git` if git is not wired to use it.'
  );
}
