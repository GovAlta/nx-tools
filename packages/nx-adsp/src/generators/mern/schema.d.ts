import { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';
import { NginxProxyConfiguration } from '../../utils/nginx';

export interface Schema {
  name: string;
  env: EnvironmentName;
  accessToken?: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration;
}
