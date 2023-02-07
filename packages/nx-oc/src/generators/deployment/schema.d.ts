export interface Schema {
  project: string;
  tenant: string;
}

export type ApplicationType = 'node' | 'dotnet' | 'frontend';

export interface NormalizedSchema extends Schema {
  projectName: string;
  appType: ApplicationType;
  ocInfraProject: string;
  ocEnvProjects: string[];
  adsp?: Record<string, unknown>;
}
