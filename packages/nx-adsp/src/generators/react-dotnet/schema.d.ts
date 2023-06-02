import type { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';

export interface Schema {
  name: string;
  env: EnvironmentName;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration;
}
