import { Context } from '@semantic-release/commit-analyzer';
import { spawn } from 'child_process';
import { array } from 'get-stream';
import * as split from 'split2';

export async function getProjectCommitHashes(
  projectRoot: string,
  {cwd, env, lastRelease, nextRelease}: Context
) {
  const from = lastRelease?.gitHead;
  const to = nextRelease?.gitHead || 'HEAD';

  const commits = array(spawn(
    'git', 
    [
      'log', 
      '--format=%H', 
      `${from ? from + '..' : ''}${to}`, 
      '--', 
      projectRoot
    ], 
    { cwd, env: { ...process.env, ...env }}
  ).stdout.pipe(split()));

  return commits;
}
