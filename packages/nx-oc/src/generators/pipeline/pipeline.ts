import {
  formatFiles,
  generateFiles,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { pipelineEnvs as envs } from '../../pipeline-envs';
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
    pipelineType: options.type === 'jenkins' ? 'jenkins' : 'actions',
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    sourceRepositoryUrl: getGitRemoteUrl()?.trim(),
    envs,
    tmpl: '',
  };

  if (options.pipelineType === 'jenkins') {
    generateFiles(
      host,
      path.join(__dirname, 'jenkins'),
      `./.openshift`,
      templateOptions
    );
  } else if (options.pipelineType === 'actions') {
    generateFiles(
      host,
      path.join(__dirname, 'actions/openshift'),
      `./.openshift`,
      templateOptions
    );
    generateFiles(
      host,
      path.join(__dirname, 'actions/workflows'),
      `./.github/workflows`,
      templateOptions
    );
  }
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = normalizeOptions(host, options);

  addFiles(host, normalizedOptions);
  await formatFiles(host);

  if (normalizedOptions.applyPipeline) {
    await applyInfraGenerator(host);
  }
}
