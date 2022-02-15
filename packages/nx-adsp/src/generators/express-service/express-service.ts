import { UnitTestRunner } from '@nrwl/angular/src/utils/test-runners';
import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  Tree,
} from '@nrwl/devkit';
import { Linter } from '@nrwl/linter';
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
    adsp
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

  const { applicationGenerator: initExpress } = await import('@nrwl/express');
  await initExpress(
    host, 
    { 
      ...options, 
      skipFormat: true, 
      skipPackageJson: false, 
      linter: Linter.EsLint, 
      unitTestRunner: UnitTestRunner.Jest, 
      pascalCaseFiles: false, 
      js: false, 
    }
  );
  
  addDependenciesToPackageJson(
    host, 
    {
      'jwks-rsa': '^2.0.2',
      'passport': '^0.4.1',
      "passport-anonymous": "^1.0.1",
      'passport-jwt': '^4.0.0',
    },
    {
      '@types/passport': '^1.0.6',
      "@types/passport-anonymous": "^1.0.3",
      '@types/passport-jwt': '^3.0.5',
    }
  );
  
  addFiles(host, normalizedOptions);
  await formatFiles(host);

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

  return () => {
    installPackagesTask(host);
  }
}
