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
