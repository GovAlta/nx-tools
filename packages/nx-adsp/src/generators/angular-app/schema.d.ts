import { EnvironmentName } from '../../utils/environments';

export interface AngularAppGeneratorSchema {
  name: string;
  env: EnvironmentName;
  realm: string;
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
