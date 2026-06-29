export interface Schema {
  project: string;
  env: 'dev' | 'test' | 'prod';
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  envProject: string;
  ocInfraProject: string;
}
