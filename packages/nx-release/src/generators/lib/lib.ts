import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  offsetFromRoot,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import * as path from 'path';
import { NormalizedSchema, Schema } from './schema';

function addFiles(host: Tree, options: NormalizedSchema) {
  
  const templateOptions = {
    ...options,
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    tmpl: '',
  };

  if (!host.exists('.releaserc.json')) {
    generateFiles(
      host,
      path.join(__dirname, 'root-files'),
      '.',
      templateOptions
    );
  }
  
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {

  const config = readProjectConfiguration(host, options.project);
  const { build } = config.targets;
  if (
    config.projectType !== 'library' ||
    !build
  ) {
    console.log('This generator can only be run against buildable libraries.');
  } else {

    addDependenciesToPackageJson(
      host, 
      {
      },
      {
        'semantic-release': '~17.4.2'
      }
    )

    config.targets.release = {
      executor: '@nrwl/workspace:run-command',
      options: {
        command: `npx semantic-release -e ./${config.root}/.releaserc.json`
      }
    }
    
    updateProjectConfiguration(host, options.project, config);

    const { libsDir } = getWorkspaceLayout(host);
    const normalizedOptions = {
      ...options,
      projectRoot: config.root,
      projectDist: build.options.outputPath || 
        `dist/${libsDir}/${options.project}`
    }
  
    addFiles(host, normalizedOptions);
    await formatFiles(host);

    return () => {
      installPackagesTask(host);
    }
  }
}
