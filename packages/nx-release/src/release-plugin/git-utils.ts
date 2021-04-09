import { spawn } from 'child_process';
import { array } from 'get-stream';
import * as split from 'split2';

const projectCommits: Record<string, string[]> = {}

export async function getPathCommitHashes(
  project: string,
  paths: string[],
  from: string,
  to = 'HEAD'
) {
  if (!projectCommits[project]) {
    
    const commits = await array<string>(spawn(
      'git', 
      [
        'log', 
        '--format=%H', 
        `${from ? `${from}..` : ''}${to}`, 
        '--', 
        ...paths
      ]
    ).stdout.pipe(split()));

    projectCommits[project] = commits;
  }

  return projectCommits[project];
}
