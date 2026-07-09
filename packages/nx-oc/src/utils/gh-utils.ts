import { execFileSync } from 'child_process';

export function checkGhCli(): void {
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'pipe' });
  } catch {
    throw new Error(
      'gh CLI is not installed or not authenticated. Run `gh auth login` then re-try.'
    );
  }
}

export function setGhSecret(name: string, value: string, repo: string): boolean {
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

export function setGhVariable(name: string, value: string, repo: string): boolean {
  try {
    execFileSync('gh', ['variable', 'set', name, '--repo', repo, '--body', value], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

// Prompts (masked) for a GitHub PAT. Returns undefined if the prompt is
// cancelled or left empty. Callers that already hold a PAT (e.g. the pipeline
// generator prompting once for several steps) pass it through and skip this.
export async function promptForGitHubPat(message: string): Promise<string | undefined> {
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
