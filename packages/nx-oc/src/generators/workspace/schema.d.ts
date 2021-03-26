export interface Schema {
  pipeline: string;
  infra: string;
  dev: string;
}

export interface NormalizedSchema extends Schema {
  ocPipelineName: string;
  ocProjectInfra: string;
  ocProjectDev: string;
}
