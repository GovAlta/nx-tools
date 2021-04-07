import { Context } from '@semantic-release/semantic-release';
import { spawn } from 'child_process';
import { array } from 'get-stream';
import * as split from 'split2';

const projectCommits: Record<string, string[]> = {}

export async function getPathCommitHashes(
  path: string,
  {cwd, env, lastRelease, nextRelease}: Context
) {
  const from = lastRelease?.gitHead;
  const to = nextRelease?.gitHead || 'HEAD';

  if (!projectCommits[path]) {
    
    const commits = await array<string>(spawn(
      'git', 
      [
        'log', 
        '--format=%H', 
        `${from ? from + '..' : ''}${to}`, 
        '--', 
        path
      ], 
      { cwd, env: { ...process.env, ...env }}
    ).stdout.pipe(split()));

    projectCommits[path] = commits;
  }

  return projectCommits[path];
}
