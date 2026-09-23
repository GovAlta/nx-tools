// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync, spawnSync } from 'child_process';
import { detectEnvironment, Environment } from './diagnose';

/**
 * Ensure the machine is set up to reach the harness repository, attempting non-destructive fixes
 * where possible rather than failing immediately.
 *
 * Two cases, in order:
 *
 * 1. gh present, not authenticated, TTY: spawn 'gh auth login' interactively so the user can
 *    complete it in the same session without leaving the installer. Only when stdin is a terminal —
 *    a non-interactive shell has nobody to complete the login flow.
 *
 * 2. gh present, authenticated: run 'gh auth setup-git'. In managed environments (Dev Spaces, CI
 *    with a PAT) gh is often pre-authenticated but git's credential helper is not wired to use it,
 *    so a network-capable machine fails the first fetch with an auth error. setup-git is idempotent
 *    and non-interactive, so running it unconditionally before the fetch costs nothing and removes
 *    the most common source of that failure.
 *
 * Neither case throws: if a fix cannot be applied (login aborted, setup-git fails) the installer
 * proceeds to the fetch as-is, where a failure will produce the normal diagnostic.
 */
export function ensurePrereqs(
  err: (text: string) => void,
  env: Environment = detectEnvironment(),
  tty = Boolean(process.stdin.isTTY),
): void {
  if (!env.ghPresent) return;

  if (!env.ghAuthenticated) {
    if (!tty) return;
    err("No GitHub account is authenticated; running 'gh auth login'...\n");
    const result = spawnSync('gh', ['auth', 'login'], { stdio: 'inherit' });
    if ((result.status ?? 1) !== 0) return;
  }

  try {
    execFileSync('gh', ['auth', 'setup-git'], { stdio: 'ignore' });
  } catch {
    // Non-fatal: credentials may be wired another way. The fetch attempt itself will say.
  }
}
