export interface Schema {
  name: string;
  tenant: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  openshiftDirectory: string;
  tenantRealm: string;
  accessServiceUrl: string;
}
