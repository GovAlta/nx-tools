import { AdspConfiguration } from '../../adsp';

export type ApplicationType = 'node' | 'dotnet' | 'frontend';
export type DatabaseType = 'none' | 'postgres' | 'mongo';

export interface Schema {
  project: string;
  appType?: ApplicationType;
  env: EnvironmentName;
  adsp?: AdspConfiguration;
  accessToken?: string;
  database?: DatabaseType;
  sandbox?: boolean;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  appType: ApplicationType;
  ocInfraProject: string;
  ocEnvProjects: string[];
  adsp: AdspConfiguration;
  buildOutputPath: string;
}
