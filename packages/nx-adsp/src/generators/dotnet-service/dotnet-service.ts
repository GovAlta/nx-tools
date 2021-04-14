import {
  addDependenciesToPackageJson,
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  Tree
} from '@nrwl/devkit';
import camelcase from 'camelcase';
import * as path from 'path';
import { getAdspConfiguration, hasDependency } from '../../utils/adsp-utils';
import { Schema, NormalizedSchema } from './schema';

function normalizeOptions(
  host: Tree,
  options: Schema
): NormalizedSchema {
  const projectName = names(options.name).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;
  
  const adsp = getAdspConfiguration(host, options);

  return {
    ...options,
    projectName,
    projectRoot,
    adsp,
    namespace: camelcase(
      options.namespace || projectName, 
      { pascalCase: true }
    )
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    tmpl: ''
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  
  const normalizedOptions = normalizeOptions(host, options);
  
  addDependenciesToPackageJson(
    host, 
    {},
    {
      '@abgov/nx-dotnet': '~1.0.0-beta.2'
    }
  );

  addProjectConfiguration(
    host, 
    normalizedOptions.projectName,
    {
      root: normalizedOptions.projectRoot,
      projectType: 'application',
      targets: {
        test: {
          executor: '@abgov/nx-dotnet:test'
        },
        build: {
          executor: '@abgov/nx-dotnet:build',
          options: {
            configuration: 'Debug'
          },
          configurations: {
            production: {
              configuration: 'Release'
            }
          }
        },
        serve: {
          executor: '@abgov/nx-dotnet:serve'
        }
      }
    }
  )

  addFiles(host, normalizedOptions);
  await formatFiles(host);

  if (hasDependency(host, '@abgov/nx-dotnet')) {
    const { workspaceGenerator } = await import(`${'@abgov/nx-dotnet'}`);
    await workspaceGenerator(host, {});
  }

  if (hasDependency(host, '@abgov/nx-oc')) {
    const { deploymentGenerator } = await import(`${'@abgov/nx-oc'}`);
    await deploymentGenerator(
      host, 
      {
        ...options, 
        project: normalizedOptions.projectName
      }
    );
  }

  return async () => {
    installPackagesTask(host);
  }
}
