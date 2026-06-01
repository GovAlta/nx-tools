import { spawn } from 'child_process';
import { createInterface } from 'readline';

let projectCommits: Record<string, string[]> = {};

export function clearCache(): void {
  projectCommits = {};
}

export async function getPathCommitHashes(
  cwd: string,
  project: string,
  paths: string[],
  from: string,
  to = 'HEAD'
) {
  if (!projectCommits[project]) {
    // --full-history to avoid history simplification ignoring commits on some merged branches.
    const child = spawn(
      'git',
      [
        'log',
        '--format=%H',
        '--full-history',
        `${from ? `${from}..` : ''}${to}`,
        '--',
        ...paths,
      ],
      { cwd }
    );

    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));

    const commits: string[] = [];
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      if (line) commits.push(line);
    }

    const exitCode = await new Promise<number>((resolve) => child.on('close', resolve));
    if (exitCode !== 0) {
      throw new Error(`git log failed with exit code ${exitCode}: ${stderr.trim()}`);
    }

    projectCommits[project] = commits;
  }

  return projectCommits[project];
}
