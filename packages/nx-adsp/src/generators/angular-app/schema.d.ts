import { AdspConfiguration } from '../../utils/adsp';
import { EnvironmentName } from '../../utils/environments';

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
