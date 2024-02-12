import { workspaceRoot } from '@nx/devkit';
import {
  Context,
  PluginConfig,
  PluginFunction,
} from '@semantic-release/semantic-release';
import { getPathCommitHashes } from './git-utils';
import { getProjectChangePaths } from './nx-util';

export interface WrappedPluginConfig extends PluginConfig {
  project: string;
}

export const wrapPlugin =
  (plugin: PluginFunction) =>
  async (
    { project, ...pluginConfig }: WrappedPluginConfig,
    context: Context
  ) => {
    const { commits, logger } = context;
    let filteredCommits = commits;

    if (!project) {
      logger.log(
        "Skipping filtering of commits; no 'project' in configuration..."
      );
    } else {
      logger.log(`Filtering commits to those affecting ${project}...`);

      const paths = await getProjectChangePaths(workspaceRoot, project);
      logger.log(`Resolved to paths: ${paths.join(', ')}...`);

      const from = context.lastRelease?.gitHead;
      const to = context.nextRelease?.gitHead;

      const hashes = await getPathCommitHashes(
        workspaceRoot,
        project,
        paths,
        from,
        to
      );

      filteredCommits = commits.filter((commit) => {
        const match = hashes.includes(commit.commit.long);
        if (match) {
          logger.log(
            `Including commit ${commit.commit.short}: ${commit.message}`
          );
        }
        return match;
      });
    }

    return await plugin(pluginConfig, { ...context, commits: filteredCommits });
  };
