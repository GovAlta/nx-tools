declare namespace SemanticRelease {
   import('semantic-release');
   import { Commit, Context as BaseContext } from 'semantic-release';

   interface Context extends BaseContext {
      cwd: string;
      env: Record<string, string>;
      commits: Commit[];
   }

   type PluginFunction = 
      (pluginConfig: Record<string, unknown>, context: Context) => Promise<ReleaseType>
}

declare module '@semantic-release/semantic-release' {
   export = SemanticRelease
}

declare namespace CommitAnalyzer {

   type ReleaseType = string;
   
   const analyzeCommits: SemanticRelease.PluginFunction

   module.exports = { analyzeCommits }
}

declare module '@semantic-release/commit-analyzer' {
   export = CommitAnalyzer; 
}

declare module '@semantic-release/semantic-release' {
   export = SemanticRelease
}

declare namespace ReleaseNotesGenerator {

   type ReleaseType = string;
   
   const generateNotes: SemanticRelease.PluginFunction

   module.exports = { generateNotes }
}

declare module '@semantic-release/release-notes-generator' {
   export = ReleaseNotesGenerator; 
}

