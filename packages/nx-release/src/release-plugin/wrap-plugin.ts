import { Context, PluginConfig, PluginFunction } from '@semantic-release/semantic-release';
import { getMergeCommitHashes, getPathCommitHashes } from './git-utils';
import { getProjectChangePaths } from './nx-util';

export interface WrappedPluginConfig extends PluginConfig {
  project: string
}

export const wrapPlugin = (plugin: PluginFunction) => async (
  {project, ...pluginConfig} : WrappedPluginConfig, 
  context: Context
) => {
  const {commits, logger} = context;
  let filteredCommits = commits;

  if (!project) {
    logger.log("Skipping filtering of commits; no 'project' in configuration...");
  } else {
    logger.log(`Filtering commits to those affecting ${project}...`);
    
    const paths = await getProjectChangePaths(project);
    logger.log(`Resolved to paths: ${paths.join(', ')}...`);

    const from = context.lastRelease?.gitHead;
    const to = context.nextRelease?.gitHead;

    // Include merge commits as well as commits impacting particular paths.
    // Merge commit for channel upgrade (next -> main) is TREESAME, but has to be
    // analyzed for add channel.
    const hashes = [
      ...await getMergeCommitHashes(from, to),
      ...await getPathCommitHashes(project, paths, from, to)
    ];
    
    filteredCommits = commits.filter(
      commit => {
        const match = hashes.includes(commit.commit.long);
        if (match) {
          logger.log(`Including commit ${commit.commit.short}: ${commit.message}`);
        }
        return match;
      }
    );
  }
  
  return await plugin(pluginConfig, {...context, commits: filteredCommits});
}
