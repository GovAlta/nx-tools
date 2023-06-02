import { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';
import { NginxProxyConfiguration } from '../../utils/nginx';

export interface Schema {
  name: string;
  env: EnvironmentName;
  proxy?: NginxProxyConfiguration | NginxProxyConfiguration[];
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration;
  nginxProxies: NginxProxyConfiguration[];
}
