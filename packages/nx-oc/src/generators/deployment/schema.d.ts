export interface Schema {
  project: string;
  tenant: string;
  frontend?: boolean;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  appType: 'frontend' | 'backend';
  tenantRealm: string;
  accessServiceUrl: string;
}
