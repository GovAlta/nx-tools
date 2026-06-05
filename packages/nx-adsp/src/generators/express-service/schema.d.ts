import type { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';

export interface Schema {
  name: string;
  env: EnvironmentName;
  tenant?: string;
  accessToken?: string;
  /** When true, skip the agent interaction. Used by composite generators that run the agent themselves. */
  skipAgent?: boolean;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  adsp: AdspConfiguration;
}
