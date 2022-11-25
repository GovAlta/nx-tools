import { AdspConfiguration } from '../../utils/adsp';

export interface Schema {
  name: string;
  env: EnvironmentName;
  realm: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  adsp: AdspConfiguration;
}
