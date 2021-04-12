export interface Schema {
  csProject?: string;
  configuration: string;
}

export interface NormalizedSchema extends Schema {
  csProject: string;
}
