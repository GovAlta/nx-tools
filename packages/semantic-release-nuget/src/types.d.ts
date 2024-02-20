declare namespace SemanticRelease {
  import('semantic-release');
  import { BaseContext } from 'semantic-release';

  type PluginConfig = Record<string, unknown>;

  type PluginFunction<T extends BaseContext> = (
    pluginConfig: PluginConfig,
    context: T
  ) => Promise<ReleaseType>;
}

declare module '@semantic-release/semantic-release' {
  export = SemanticRelease;
}
