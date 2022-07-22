import { PluginConfig } from '@semantic-release/semantic-release';

export interface NugetPluginConfig extends PluginConfig {
  configuration: string;
  includeSymbols: boolean;
  includeSource: boolean;
  serviceable: boolean;
  nupkgRoot: string;
  source: string;
  apiKey: string;
  symbolSource: string;
  symbolApiKey: string;
  skipDuplicate: boolean;
  timeout: number;
}
