import { 
  analyzeCommits as baseAnalyzeCommits,
  Context
} from '@semantic-release/commit-analyzer';
import { getProjectCommitHashes } from './git-utils';

const analyzeCommits = async function(
  {projectRoot, ...pluginConfig}: { projectRoot: string }, 
  context: Context
) {
  const {commits, logger} = context;

  logger.log(`Filtering commits to those under ${projectRoot}...`);
  const hashes = await getProjectCommitHashes(projectRoot, context);
  const filteredCommits = commits.filter(
    commit => {
      const match = hashes.includes(commit.commit.long);
      if (match) {
        logger.log(`Including commit ${commit.commit.short}: ${commit.message}`);
      }
      return match;
    }
  );

  await baseAnalyzeCommits(pluginConfig, {...context, commits: filteredCommits});
}

export { analyzeCommits }
