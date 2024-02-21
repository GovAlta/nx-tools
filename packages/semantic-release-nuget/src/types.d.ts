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
