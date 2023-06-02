import type { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';

export interface AngularAppGeneratorSchema {
  name: string;
  env: EnvironmentName;
  proxy?: NginxProxyConfiguration | NginxProxyConfiguration[];
}

export interface NormalizedSchema extends AngularAppGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectOrg: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration;
  nginxProxies: NginxProxyConfiguration[];
}
