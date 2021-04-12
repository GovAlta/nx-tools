export interface Schema {
  csProject?: string;
}

export interface NormalizedSchema extends Schema {
  csProject: string;
}
