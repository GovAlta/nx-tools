import { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';
import { NginxProxyConfiguration } from '../../utils/nginx';

export interface Schema {
  name: string;
  env: EnvironmentName;
  accessToken?: string;
  tenant?: string;
  tenantRealm?: string;
  serviceClientId?: string;
  proxy?: NginxProxyConfiguration | NginxProxyConfiguration[];
  /** When true, skip the agent interaction. Used by composite generators that run the agent themselves. */
  skipAgent?: boolean;
  /** Name of the paired backend service project, set by composite generators (pevn, etc.). */
  pairedProject?: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration;
  nginxProxies: NginxProxyConfiguration[];
}
