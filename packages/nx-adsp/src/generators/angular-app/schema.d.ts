export interface AngularAppGeneratorSchema {
  name: string;
  tenant: string;
  proxy?: NginxProxyConfiguration | NginxProxyConfiguration[]
}


export interface NormalizedSchema extends AngularAppGeneratorSchema {
  projectName: string;
  projectRoot: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration
  nginxProxies: NginxProxyConfiguration[];
}
