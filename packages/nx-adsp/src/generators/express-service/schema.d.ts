import { AdspConfiguration } from '../../utils/adsp';
import { EnvironmentName } from '../../utils/environments';

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
