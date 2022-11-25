import { AdspConfiguration } from '../../utils/adsp';
import { EnvironmentName } from '../../utils/environments';
import { NginxProxyConfiguration } from '../../utils/nginx';

export interface Schema {
  name: string;
  env: EnvironmentName;
  realm: string;
  proxy?: NginxProxyConfiguration | NginxProxyConfiguration[];
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration;
  nginxProxies: NginxProxyConfiguration[];
}
