export interface Schema {
  project: string;
  tenant: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  appType: 'frontend' | 'express' | 'dotnet';
  ocInfraProject: string;
  ocEnvProjects: string[];
  adsp: {
    tenantRealm: string;
    accessServiceUrl: string;
  }
}
