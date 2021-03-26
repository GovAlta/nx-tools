export interface Schema {
  project: string;
  frontend?: boolean;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  appType: 'frontend' | 'backend';
}
