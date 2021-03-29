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

  if (
    !options.pipeline ||
    !options.infra || 
    !options.dev) {
    throw new Error('Pipline, Infra and Dev project values are required.');
  }
  

  return {
    ...options,
    ocPipelineName: options.pipeline,
    ocInfraProject: options.infra,
    ocDevProject: options.dev,
    applyPipeline: !!options.apply,
    pipelineType: 'jenkins' // TODO: Introduce Tekton based pipeline for 4.x
  }
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    sourceRepositoryUrl: getGitRemoteUrl()?.trim(),
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
