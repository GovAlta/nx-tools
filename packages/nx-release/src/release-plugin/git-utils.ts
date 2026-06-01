import { spawn } from 'child_process';
import { createInterface } from 'readline';

const projectCommits: Record<string, string[]> = {};

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

    const commits: string[] = [];
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      if (line) commits.push(line);
    }

    projectCommits[project] = commits;
  }

  return projectCommits[project];
}
