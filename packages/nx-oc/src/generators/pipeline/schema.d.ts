export interface Schema {
  pipeline: string;
  infra: string;
  dev: string;
  apply?: boolean;
}

export interface NormalizedSchema extends Schema {
  ocPipelineName: string;
  ocInfraProject: string;
  ocDevProject: string;
  applyPipeline: boolean;
  pipelineType: 'jenkins' | 'tekton';
}
