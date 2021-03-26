export interface Schema {
  project: string;
  tenant: string;
  frontend: boolean;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  appType: 'frontend' | 'backend';
  ocInfraProject: string;
  ocEnvProjects: string[];
  tenantRealm: string;
  accessServiceUrl: string;
}
