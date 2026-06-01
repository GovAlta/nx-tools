export interface NugetPluginConfig {
  project?: string | string[];
  configuration?: string;
  noBuild?: boolean;
  includeSymbols?: boolean;
  includeSource?: boolean;
  serviceable?: boolean;
  nupkgRoot?: string;
  source?: string;
  symbolSource?: string;
  skipDuplicate?: boolean;
  timeout?: number;
}
