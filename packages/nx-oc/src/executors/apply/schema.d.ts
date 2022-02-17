export interface PipelineEnvironment {
  project: string;
  tag: string;
}

export interface Schema {
  ocProject: string | string[] | PipelineEnvironment[];
}

export interface NormalizedSchema {
  ocProjects: PipelineEnvironment[];
}
