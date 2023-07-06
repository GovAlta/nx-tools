import { AdspConfiguration } from '../../adsp';

export type ApplicationType = 'node' | 'dotnet' | 'frontend';

export interface Schema {
  project: string;
  appType?: ApplicationType;
  env: EnvironmentName;
  adsp?: AdspConfiguration;
  accessToken?: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  appType: ApplicationType;
  ocInfraProject: string;
  ocEnvProjects: string[];
  adsp: AdspConfiguration;
}
