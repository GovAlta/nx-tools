import {
  formatFiles,
  generateFiles,
  getWorkspacePath,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { getGitRemoteUrl } from '../../utils/git-utils';
import { runOcCommand } from '../../utils/oc-utils';
import { Schema, NormalizedSchema } from './schema';

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  return {
    ...options,
    ocPipelineName: options.pipeline,
    ocProjectInfra: options.infra,
    ocProjectDev: options.dev
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

function applyOcResources(host: Tree) {

  const { success: pipelineApplied } = runOcCommand(
    'apply', 
    [`-f ${host}/.openshift/pipeline.yml`]
  );
  
  const { success: envApplied } = runOcCommand(
    'apply', 
    [`-f ${host}/.openshift/environment.dev.yml`]
  );

  if (!pipelineApplied || !envApplied) {
    console.log('Failed to oc apply pipeline and dev environment.');
  }
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = normalizeOptions(host, options);
  
  addFiles(host, normalizedOptions);
  await formatFiles(host);

  const { success } = runOcCommand('project', []);
  if (success) {
    applyOcResources(host);
  } else {
    console.log('Skipping oc apply; oc login before running to apply.');
  }
}
