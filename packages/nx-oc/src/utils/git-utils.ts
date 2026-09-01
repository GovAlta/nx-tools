import { execSync } from 'child_process';

export function getGitRemoteUrl(): string | undefined {
  try {
    const stdout = execSync('git config --get remote.origin.url', {
      stdio: 'pipe',
    }).toString();

    return stdout;
  } catch {
    // No 'origin' remote (e.g. a freshly-created workspace) — not an error;
    // sourceRepositoryUrl is simply left unset.
    return undefined;
  }
}

// The patterns below are all anchored at `^`, which is what keeps them linear.
// Unanchored, the engine can retry the literal prefix at every position in the
// string, so a value made of many repetitions of `git@github.com:` costs
// O(n^2) — CodeQL js/polynomial-redos flagged three of these. A remote URL
// always begins with its scheme, so anchoring costs nothing real; the one shape
// it stops accepting is a scheme-prefixed spec like `git+https://github.com/...`,
// which is an npm dependency specifier, not a value `git config
// --get remote.origin.url` returns.
//
// Practical exposure was low — the only in-repo caller feeds these the developer's
// own git config output at generator time — but these are re-exported from
// nx-oc's public API, so a consumer can pass anything.
const HTTPS_ORG = /^https:\/\/github\.com\/([^/]+)\//;
const SSH_ORG = /^git@github\.com:([^/]+)\//;

// `\s*$` is deliberately absent. It was not just redundant after the trim below
// (it could only ever match empty there) — combined with the lazy `(.+?)` it was
// the backtracking driver, and reachable even post-trim: a value with interior
// whitespace and a non-space ending makes `\s*$` fail at every expansion.
// Measured on the old pattern, 6 KB of that shape took 21ms; anchored and without
// it, 0ms.
const HTTPS_REPO = /^https:\/\/github\.com\/(.+?)(?:\.git)?$/;
const SSH_REPO = /^git@github\.com:(.+?)(?:\.git)?$/;

// Parses a GitHub remote URL and returns the ghcr.io registry for the org.
// Handles both HTTPS (https://github.com/ORG/REPO.git) and
// SSH (git@github.com:ORG/REPO.git) formats.
export function deriveRegistryFromRemote(
  remoteUrl?: string,
): string | undefined {
  if (!remoteUrl) return undefined;
  const url = remoteUrl.trim();
  const org = url.match(HTTPS_ORG)?.[1] ?? url.match(SSH_ORG)?.[1];
  return org ? `ghcr.io/${org}` : undefined;
}

// Returns the "owner/repo" slug for use with `gh secret set --repo`.
export function getGitHubRepo(remoteUrl?: string): string | undefined {
  if (!remoteUrl) return undefined;
  const url = remoteUrl.trim();
  return url.match(HTTPS_REPO)?.[1] ?? url.match(SSH_REPO)?.[1];
}
