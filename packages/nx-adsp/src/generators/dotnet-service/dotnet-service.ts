import {
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { getAdspConfiguration, hasDependency } from '../../utils/adsp-utils';
import { Schema, NormalizedSchema } from './schema';

async function normalizeOptions(
  host: Tree,
  options: Schema
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
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  if (!hasDependency(host, '@nx-dotnet/core')) {
    throw new Error('nx-dotnet/core is required to generate dotnet service');
  }

  const normalizedOptions = await normalizeOptions(host, options);

  const { default: appGenerator } = await import(
    `${'@nx-dotnet/core/src/generators/app/generator'}`
  );

  const { default: refGenerator } = await import(
    `${'@nx-dotnet/core/src/generators/nuget-reference/generator'}`
  );

  await appGenerator(host, {
    name: normalizedOptions.projectName,
    template: 'webapi',
    language: 'C#',
    testTemplate: 'none',
    solutionFile: false,
    skipSwaggerLib: true,
    pathScheme: 'nx',
  });

  await refGenerator(host, {
    project: normalizedOptions.projectName,
    packageName: 'Adsp.Sdk',
    version: '1.*',
  });

  addFiles(host, normalizedOptions);

  if (hasDependency(host, '@abgov/nx-oc')) {
    const { deploymentGenerator } = await import(`${'@abgov/nx-oc'}`);
    await deploymentGenerator(host, {
      ...normalizedOptions,
      project: normalizedOptions.projectName,
    });
  }

  return async () => {
    installPackagesTask(host);
  };
}
