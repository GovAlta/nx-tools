declare namespace CommitAnalyzer {
   import('semantic-release');
   import { Commit, Context as BaseContext } from 'semantic-release';

   type ReleaseType = string;
   
   interface Context extends BaseContext {
      cwd: string;
      env: Record<string, string>;
      commits: Commit[];
   }
   
   async function analyzeCommits(pluginConfig, context: Context): Promise<ReleaseType>

   module.exports = { analyzeCommits }
}

declare module '@semantic-release/commit-analyzer' {
   export = CommitAnalyzer; 
}
