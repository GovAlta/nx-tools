export interface Schema {
  project: string;
}

export interface NormalizedSchema extends Schema {
  projectRoot: string;
  projectDist: string;
}
