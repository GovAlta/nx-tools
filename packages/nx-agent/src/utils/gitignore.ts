import { Tree } from '@nx/devkit';

const GITIGNORE_PATH = '.gitignore';

// Idempotent append: writes the file fresh if absent, adds only whatever
// patterns aren't already present line-for-line, and is a no-op once
// everything's there — safe to call on every generator run.
export function ensureGitignoreEntries(host: Tree, patterns: string[]): void {
  if (!host.exists(GITIGNORE_PATH)) {
    host.write(GITIGNORE_PATH, `${patterns.join('\n')}\n`);
    return;
  }

  const existing = host.read(GITIGNORE_PATH).toString();
  const existingLines = new Set(
    existing.split('\n').map((line) => line.trim()),
  );
  const missing = patterns.filter((pattern) => !existingLines.has(pattern));
  if (missing.length === 0) {
    return;
  }

  const trimmed = existing.replace(/\n+$/, '');
  host.write(GITIGNORE_PATH, `${trimmed}\n\n${missing.join('\n')}\n`);
}
