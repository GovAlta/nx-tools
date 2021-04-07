import { Context, PluginFunction } from '@semantic-release/semantic-release';
import { getPathCommitHashes } from './git-utils';

export const wrapPlugin = (plugin: PluginFunction) => async (
  {projectRoot, ...pluginConfig}, 
  context: Context
) => {
  const {commits, logger} = context;

  logger.log(`Filtering commits to those under ${projectRoot}...`);
  const hashes = await getPathCommitHashes(projectRoot, context);
  const filteredCommits = commits.filter(
    commit => {
      const match = hashes.includes(commit.commit.long);
      if (match) {
        logger.log(`Including commit ${commit.commit.short}: ${commit.message}`);
      }
      return match;
    }
  );

  await plugin(pluginConfig, {...context, commits: filteredCommits});
}
