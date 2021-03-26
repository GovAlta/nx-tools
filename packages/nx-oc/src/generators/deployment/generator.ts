import {
  formatFiles,
  generateFiles,
  getWorkspacePath,
  names,
  ProjectConfiguration,
  readProjectConfiguration,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { getGitRemoteUrl } from '../../utils/git-utils';
import { Schema, NormalizedSchema } from './schema';


function normalizeOptions(
  host: Tree, 
  options: Schema, 
  config: ProjectConfiguration
): NormalizedSchema {
  
  if (options.frontend === null ) {
    // TODO: Find better way to determine if the project is frontend or backend.
    options.frontend = 
     config.targets['build']?.executor === '@nrwl/web:build';
  }

  return {
    ...options,
    projectName: names(options.project).fileName,
    appType: options.frontend ? 'frontend' : 'backend'
  }
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
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
  if (config.projectType === 'application') {
    const normalizedOptions = normalizeOptions(host, options, config);
    
    addFiles(host, normalizedOptions);
    await formatFiles(host);

  } else {
    console.log('Cannot generate deployment for library.');
  }
}
