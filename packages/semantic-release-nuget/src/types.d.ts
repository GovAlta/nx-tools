declare namespace SemanticRelease {
  import('semantic-release');
  import { Commit, Context as BaseContext } from 'semantic-release';
  import { Writable } from 'stream';
  
  interface Context extends BaseContext {
    cwd: string;
    env: Record<string, string>;
    stdout: Writable;
    stderr: Writable;
    commits: Commit[];
  }

  type PluginConfig = Record<string, unknown>;

  type PluginFunction = (
    pluginConfig: PluginConfig,
    context: Context
  ) => Promise<ReleaseType>;
}

declare module '@semantic-release/semantic-release' {
  export = SemanticRelease;
}
