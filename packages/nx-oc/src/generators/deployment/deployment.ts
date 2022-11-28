import {
  formatFiles,
  generateFiles,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import * as path from 'path';
import * as yaml from 'yaml';
import { pipelineEnvs as envs } from '../../pipeline-envs';
import { getGitRemoteUrl } from '../../utils/git-utils';
import { NormalizedSchema, Schema } from './schema';

const infraManifestFile = '.openshift/environments.yml';

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const projectName = names(options.project).fileName;

  const result = host.read(infraManifestFile).toString();
  const { items } = yaml.parse(result);
  const ocInfraProject = items[0]?.metadata?.namespace || '';

  const SA_PREFIX = 'system:serviceaccounts:';
  const ocEnvProjects = items[0]?.subjects
    ?.filter((s) => s.kind === 'Group' && s.name.startsWith(SA_PREFIX))
    .map((s) => s.name.replace(SA_PREFIX, ''));

  // TODO: Find a better way to determine this.
  const config = readProjectConfiguration(host, projectName);
  let appType = null;
  switch (config.targets.build.executor) {
    case '@nrwl/web:webpack':
    case '@angular-devkit/build-angular:browser':
      appType = 'frontend';
      break;
    case '@nrwl/node:build':
      appType = 'express';
      break;
    case '@nx-dotnet/core:build':
      appType = 'dotnet';
      break;
  }

  return {
    ...options,
    projectName,
    appType,
    ocInfraProject,
    ocEnvProjects,
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    sourceRepositoryUrl: getGitRemoteUrl(),
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, `${options.appType}-files`),
    `./.openshift/${options.projectName}`,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  const config = readProjectConfiguration(host, options.project);
  if (config.projectType !== 'application') {
    console.log('Cannot generate deployment for library.');
    return;
  }

  if (!host.exists(infraManifestFile)) {
    console.log(
      `Cannot generate deployment; run 'nx g @abgov/nx-oc:workspace' first.`
    );
    return;
  }

  const normalizedOptions = normalizeOptions(host, options);
  if (!normalizedOptions.appType) {
    console.log('Cannot generate deployment for unknown project type.');
    return;
  }

  config.targets = {
    ...config.targets,
    'apply-envs': {
      executor: '@abgov/nx-oc:apply',
      options: {
        ocProject: normalizedOptions.ocEnvProjects.map((project, i) => ({
          project,
          tag: envs[i]?.toLowerCase(),
        })),
      },
    },
  };

  updateProjectConfiguration(host, options.project, config);

  addFiles(host, normalizedOptions);
  await formatFiles(host);
}
