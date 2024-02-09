import {
  formatFiles,
  generateFiles,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nx/devkit';
import * as path from 'path';
import * as yaml from 'yaml';
import { pipelineEnvs as envs } from '../../pipeline-envs';
import { getGitRemoteUrl } from '../../utils/git-utils';
import { ApplicationType, NormalizedSchema, Schema } from './schema';
import { getAdspConfiguration } from '../../adsp';

const infraManifestFile = '.openshift/environments.yml';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
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
  let appType: ApplicationType = options.appType;
  if (!appType) {
    switch (config.targets.build.executor) {
      case '@nx/web:webpack':
      case '@angular-devkit/build-angular:browser':
        appType = 'frontend';
        break;
      case '@nx/node:build':
        appType = 'node';
        break;
      case '@nx-dotnet/core:build':
        appType = 'dotnet';
        break;
      case '@nx/webpack:webpack': {
        // More recent version of NX switched to use a generic webpack executor for builds.
        appType =
          config.targets.build.options.target === 'node' ? 'node' : 'frontend';
        break;
      }
    }
  }

  const adsp = await getAdspConfiguration(host, options);

  return {
    ...options,
    appType,
    adsp,
    projectName,
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

  const normalizedOptions = await normalizeOptions(host, options);
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
