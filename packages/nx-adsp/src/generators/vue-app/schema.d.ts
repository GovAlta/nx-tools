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
  /** Name of an existing backend service project to derive the nginx/dev-server proxy and the adsp:proxy-service: sandbox tag from. */
  pairedProject?: string;
  /** Top-level app shell: 'header' (default, public-facing) or 'internal' (staff-facing side menu, no header/banner/footer). */
  layout?: 'header' | 'internal';
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration;
  nginxProxies: NginxProxyConfiguration[];
  /** The adsp:proxy-service: tag derived from pairedProject, if one was given. */
  pairedProjectTag?: string;
}
