import { AdspConfiguration } from '../../utils/adsp';
import { NginxProxyConfiguration } from '../../utils/nginx';

export interface Schema {
  name: string;
  tenant: string;
  proxy?: NginxProxyConfiguration | NginxProxyConfiguration[]
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration
  nginxProxies: NginxProxyConfiguration[];
}
