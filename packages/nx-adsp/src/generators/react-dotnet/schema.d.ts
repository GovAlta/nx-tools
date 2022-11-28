import { EnvironmentName } from '../../utils/environments';

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
