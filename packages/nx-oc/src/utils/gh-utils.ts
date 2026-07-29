import { execFileSync, execSync } from 'child_process';

// `gh auth status` lists every logged-in account in its own block, each
// starting with "✓ Logged in to ..." and containing its own "Active
// account:"/"Token scopes:" lines — only the block with "Active account:
// true" is the one whose scopes actually apply to the gh commands the rest
// of a caller makes. Returns undefined if no block (or no scopes line
// within it) can be found, so callers can tell "couldn't tell" apart from
// "found it, and the scope is missing" (and fail open on the former).
export function activeAccountScopes(
  statusOutput: string,
): string[] | undefined {
  const blocks = statusOutput.split(/(?=✓ Logged in to)/);
  const active = blocks.find((block) => block.includes('Active account: true'));
  const match = active?.match(/Token scopes:\s*(.+)/);
  if (!match) return undefined;
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

// Checked up front by every generator/executor that shells out to `gh`, so a
// missing login (or missing scope, when `requiredScope` is given) fails with
// an actionable message before the real work starts, rather than surfacing
// later as a bare `gh`/registry auth error that says nothing about why.
// `gh auth status` succeeding only confirms *an* account is logged in, not
// that it has any particular scope — hence the separate check below.
export function checkGhCli(requiredScope?: string): void {
  let status: string;
  try {
    // 2>&1: which stream gh auth status's account details land on has
    // differed across gh CLI versions — merging both is the version-safe way
    // to capture it regardless.
    status = execSync('gh auth status 2>&1', { shell: '/bin/bash' }).toString();
  } catch {
    throw new Error(
      'gh CLI is not installed or not authenticated. Run `gh auth login` then re-try.',
    );
  }

  if (!requiredScope) return;
  const scopes = activeAccountScopes(status);
  if (scopes && !scopes.includes(requiredScope)) {
    throw new Error(
      `The active gh account is missing the '${requiredScope}' scope. Run \`gh auth refresh -h github.com -s ${requiredScope}\` ` +
        `to add it to the current login, or \`gh auth switch\` first if a different, already-scoped account should be active.`,
    );
  }
}

export function setGhSecret(
  name: string,
  value: string,
  repo: string,
): boolean {
  try {
    execFileSync('gh', ['secret', 'set', name, '--repo', repo], {
      input: Buffer.from(value),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

export function setGhVariable(
  name: string,
  value: string,
  repo: string,
): boolean {
  try {
    execFileSync(
      'gh',
      ['variable', 'set', name, '--repo', repo, '--body', value],
      {
        stdio: 'pipe',
      },
    );
    return true;
  } catch {
    return false;
  }
}

// Prompts (masked) for a GitHub PAT. Returns undefined if the prompt is
// cancelled or left empty. Callers that already hold a PAT (e.g. the pipeline
// generator prompting once for several steps) pass it through and skip this.
export async function promptForGitHubPat(
  message: string,
): Promise<string | undefined> {
  const { prompt } = await import('enquirer');
  try {
    const { pat } = await prompt<{ pat: string }>({
      type: 'password',
      name: 'pat',
      message,
    });
    return pat || undefined;
  } catch {
    return undefined;
  }
}
