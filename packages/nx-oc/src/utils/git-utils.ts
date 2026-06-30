import { execSync } from 'child_process'

export function getGitRemoteUrl(): string | undefined {
  try {
    const stdout = execSync(
      "git config --get remote.origin.url",
      { stdio: "pipe" }
    ).toString()

    return stdout
  } catch {
    // No 'origin' remote (e.g. a freshly-created workspace) — not an error;
    // sourceRepositoryUrl is simply left unset.
    return undefined
  }
}

// Parses a GitHub remote URL and returns the ghcr.io registry for the org.
// Handles both HTTPS (https://github.com/ORG/REPO.git) and
// SSH (git@github.com:ORG/REPO.git) formats.
export function deriveRegistryFromRemote(remoteUrl?: string): string | undefined {
  if (!remoteUrl) return undefined;
  const url = remoteUrl.trim();
  const httpsMatch = url.match(/https:\/\/github\.com\/([^/]+)\//);
  const sshMatch   = url.match(/git@github\.com:([^/]+)\//);
  const org = httpsMatch?.[1] ?? sshMatch?.[1];
  return org ? `ghcr.io/${org}` : undefined;
}

// Returns the "owner/repo" slug for use with `gh secret set --repo`.
export function getGitHubRepo(remoteUrl?: string): string | undefined {
  if (!remoteUrl) return undefined;
  const url = remoteUrl.trim();
  const httpsMatch = url.match(/https:\/\/github\.com\/(.+?)(?:\.git)?\s*$/);
  const sshMatch   = url.match(/git@github\.com:(.+?)(?:\.git)?\s*$/);
  return httpsMatch?.[1] ?? sshMatch?.[1];
}
