export interface Schema {
  pipeline: string;
  infra: string;
  dev: string;
}

export interface NormalizedSchema extends Schema {
  ocPipelineName: string;
  ocInfraProject: string;
  ocDevProject: string;
}
