export interface Schema {
  pipeline: string;
  type: string;
  infra: string;
  envs: string;
  registry: string;
  apply?: boolean;
}

export interface NormalizedSchema extends Schema {
  ocPipelineName: string;
  ocInfraProject: string;
  ocEnvProjects: string[];
  applyPipeline: boolean;
  pipelineType: 'jenkins' | 'actions';
}
