import { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';

export interface Schema {
  name: string;
  env: EnvironmentName;
  accessToken?: string;
}

export interface NormalizedSchema extends Schema {
  adsp: AdspConfiguration;
}
