import { PluginConfig } from '@semantic-release/semantic-release';

export interface NugetPluginConfig extends PluginConfig {
  configuration: string;
  noBuild: boolean;
  includeSymbols: boolean;
  includeSource: boolean;
  serviceable: boolean;
  nupkgRoot: string;
  source: string;
  symbolSource: string;
  skipDuplicate: boolean;
  timeout: number;
}
