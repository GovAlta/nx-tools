import { deploymentGenerator, getAdspConfiguration } from '@abgov/nx-oc';
import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  Tree,
} from '@nx/devkit';
import { Linter } from '@nx/eslint';
import * as path from 'path';
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
  const normalizedOptions = await normalizeOptions(host, options);

  const { applicationGenerator: initExpress } = await import('@nx/express');
  await initExpress(host, {
    ...options,
    skipFormat: true,
    skipPackageJson: false,
    linter: Linter.EsLint,
    unitTestRunner: 'jest',
    js: false,
    directory: `apps/${options.name}`,
  });

  addDependenciesToPackageJson(
    host,
    {
      '@abgov/adsp-service-sdk': '^2.0.0',
      dotenv: '^16.0.0',
      passport: '^0.6.0',
      'passport-anonymous': '^1.0.1',
    },
    {
      '@types/passport': '^1.0.9',
      '@types/passport-anonymous': '^1.0.3',
    }
  );

  addFiles(host, normalizedOptions);
  await formatFiles(host);

  await deploymentGenerator(host, {
    ...normalizedOptions,
    appType: 'node',
    project: normalizedOptions.projectName,
  });

  return () => {
    installPackagesTask(host);
  };
}
