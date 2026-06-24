import type { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';
import type { NginxProxyConfiguration } from '../../utils/nginx';

export interface AngularAppGeneratorSchema {
  name: string;
  env: EnvironmentName;
  accessToken?: string;
  tenant?: string;
  tenantRealm?: string;
  serviceClientId?: string;
  proxy?: NginxProxyConfiguration | NginxProxyConfiguration[];
  /** When true, skip the agent interaction. Used by composite generators that run the agent themselves. */
  skipAgent?: boolean;
}

export interface NormalizedSchema extends AngularAppGeneratorSchema {
  projectName: string;
  projectRoot: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration;
  nginxProxies: NginxProxyConfiguration[];
}
