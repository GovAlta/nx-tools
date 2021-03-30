import {
  formatFiles,
  generateFiles,
  getWorkspacePath,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { getGitRemoteUrl } from '../../utils/git-utils';
import applyInfraGenerator from '../apply-infra/apply-infra';
import { NormalizedSchema, Schema } from './schema';

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {

  const ocEnvProjects = options.envs?.split(' ') || [options.infra];

  const envsProjectsSet = new Set(ocEnvProjects);
  if (envsProjectsSet.size !== ocEnvProjects.length) {
    throw new Error('Each environment must be a unique project.');
  }

  return {
    ...options,
    ocPipelineName: options.pipeline,
    ocInfraProject: options.infra,
    ocEnvProjects: ocEnvProjects,
    applyPipeline: !!options.apply,
    pipelineType: 'jenkins' // TODO: Introduce Tekton based pipeline for 4.x
  }
}

function addFiles(host: Tree, options: NormalizedSchema) {

  const envs = ['Dev', 'Test', 'Staging', 'Prod'];

  const templateOptions = {
    ...options,
    sourceRepositoryUrl: getGitRemoteUrl()?.trim(),
    envs,
    tmpl: ''
  };
  
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    `${path.dirname(getWorkspacePath(host))}/.openshift`,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = normalizeOptions(host, options);
  
  addFiles(host, normalizedOptions);
  await formatFiles(host);

  if (normalizedOptions.applyPipeline) {
    await applyInfraGenerator(host);
  }
}
