import {
  deploymentGenerator,
  getAdspConfiguration,
  hasDependency,
} from '@abgov/nx-oc';
import {
  addProjectConfiguration,
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  Tree,
  updateJson,
} from '@nx/devkit';
import * as path from 'path';
import { Schema, NormalizedSchema } from './schema';

async function normalizeOptions(
  host: Tree,
  options: Schema,
): Promise<NormalizedSchema> {
  const projectName = names(options.name).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;

  const adsp = await getAdspConfiguration(host, options);

  return {
    ...options,
    projectName,
    projectRoot,
    adsp,
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    ...names(options.projectName),
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions,
  );
}

function ensureNuGetConfig(host: Tree) {
  if (!host.exists('NuGet.Config')) {
    generateFiles(host, path.join(__dirname, 'nuget-files'), '.', { tmpl: '' })
  }
}

export default async function (host: Tree, options: Schema) {
  if (!hasDependency(host, '@nx/dotnet')) {
    throw new Error('@nx/dotnet is required to generate dotnet service')
  }

  const normalizedOptions = await normalizeOptions(host, options)

  addProjectConfiguration(host, normalizedOptions.projectName, {
    root: normalizedOptions.projectRoot,
    projectType: 'application',
    sourceRoot: normalizedOptions.projectRoot,
    targets: {
      serve: {
        executor: 'nx:run-commands',
        options: {
          command: 'dotnet run',
          cwd: normalizedOptions.projectRoot,
        },
        configurations: {
          production: {
            command: 'dotnet run --configuration Release',
          },
        },
      },
    },
    tags: ['adsp:type:dotnet'],
  })

  updateJson(host, 'nx.json', (json) => {
    if (!json.plugins?.includes('@nx/dotnet')) {
      json.plugins = [...(json.plugins ?? []), '@nx/dotnet']
    }
    return json
  })

  ensureNuGetConfig(host)
  addFiles(host, normalizedOptions)

  await deploymentGenerator(host, {
    ...normalizedOptions,
    appType: 'dotnet',
    project: normalizedOptions.projectName,
  })

  return async () => {
    installPackagesTask(host)
  }
}
