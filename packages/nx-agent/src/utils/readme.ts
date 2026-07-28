import { Tree, joinPathFragments } from '@nx/devkit';

// Write-if-missing only — a README a team may have already started editing
// is never overwritten. Callers own their own template content (and any
// substitution into it); this just owns the "does one already exist" check.
export function ensureReadme(host: Tree, dir: string, content: string): void {
  const readmePath = joinPathFragments(dir, 'README.md');
  if (host.exists(readmePath)) {
    return;
  }
  host.write(readmePath, content);
}
