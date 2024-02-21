declare namespace SemanticRelease {
  import type { BaseContext } from 'semantic-release';

  type PluginConfig = Record<string, unknown>;

  type PluginFunction<T extends BaseContext> = (
    pluginConfig: PluginConfig,
    context: T
  ) => Promise<ReleaseType>;
}

declare module '@semantic-release/semantic-release' {
  export = SemanticRelease;
}

declare namespace CommitAnalyzer {
  type ReleaseType = string;

  const analyzeCommits: SemanticRelease.PluginFunction;

  module.exports = { analyzeCommits };
}

declare module '@semantic-release/commit-analyzer' {
  export = CommitAnalyzer;
}

declare module '@semantic-release/semantic-release' {
  export = SemanticRelease;
}

declare namespace ReleaseNotesGenerator {
  type ReleaseType = string;

  const generateNotes: SemanticRelease.PluginFunction;

  module.exports = { generateNotes };
}

declare module '@semantic-release/release-notes-generator' {
  export = ReleaseNotesGenerator;
}
