import {
  formatFiles,
  generateFiles,
  getWorkspacePath,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration
} from '@nrwl/devkit';
import * as path from 'path';
import * as yaml from 'yaml';
import { getGitRemoteUrl } from '../../utils/git-utils';
import { NormalizedSchema, Schema } from './schema';

const infraManifestFile = '.openshift/environment.infra.yml';

function normalizeOptions(
  host: Tree, 
  options: Schema
): NormalizedSchema {

  const projectName = names(options.project).fileName;

  const result = host.read(infraManifestFile).toString();
  const { items } = yaml.parse(result);
  const ocInfraProject = items[0]?.metadata?.namespace || ''
  const ocEnvProjects = items[0]?.subjects?.map(s => s.namespace);
  
  // TODO: Find a better way to determine this.
  const config = readProjectConfiguration(host, projectName);
  const appType = config.targets.build.executor === '@nrwl/web:build' ?
    'frontend' : 'backend';

  const tenantRealm = names(options.tenant).fileName;
  const accessServiceUrl = 'https://access.alpha.alberta.ca';

  return {
    ...options,
    projectName,
    appType,
    ocInfraProject,
    ocEnvProjects,
    adsp: {
      tenantRealm,
      accessServiceUrl
    }
  }
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    sourceRepositoryUrl: getGitRemoteUrl(),
    tmpl: ''
  };
  generateFiles(
    host,
    path.join(__dirname, `${options.appType}-files`),
    `${path.dirname(getWorkspacePath(host))}/.openshift/${options.projectName}`,
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
    console.log(`Cannot generate deployment; run 'nx g @abgov/nx-oc:workspace' first.`);
    return;
  }

  const normalizedOptions = normalizeOptions(host, options);

  config.targets = {
    ...config.targets,
    'apply-envs': {
      executor: '@abgov/nx-oc:apply',
      options: {
        ocProject: normalizedOptions.ocEnvProjects
      }
    }
  }

  updateProjectConfiguration(host, options.project, config);
  
  addFiles(host, normalizedOptions);
  await formatFiles(host);
}
