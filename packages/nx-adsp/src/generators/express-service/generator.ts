import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
  Tree,
} from '@nrwl/devkit';
import { wrapAngularDevkitSchematic } from '@nrwl/devkit/ngcli-adapter';
import * as path from 'path';
import { hasDependency } from '../../utils/adsp-utils';
import { Schema, NormalizedSchema } from './schema';

function normalizeOptions(
  host: Tree,
  options: Schema
): NormalizedSchema {
  const projectName = names(options.name).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;
  
  const tenantRealm = options.tenant;

  return {
    ...options,
    projectName,
    projectRoot,
    tenantRealm,
    accessServiceUrl: 'https://access.alpha.alberta.ca'
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
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
  
  const initExpress = wrapAngularDevkitSchematic('@nrwl/express', 'application');
  await initExpress(host, options);
  
  addDependenciesToPackageJson(
    host, 
    {
      'jwks-rsa': '^2.0.2',
      'passport': '^0.4.1',
      'passport-jwt': '^4.0.0',
    },
    {
      '@types/passport': '^1.0.6',
      '@types/passport-jwt': '^3.0.5',
    }
  )
  
  addFiles(host, normalizedOptions);
  await formatFiles(host);

  if (hasDependency(host, '@abgov/nx-oc')) {
    const { deploymentGenerator } = await import(`${'@abgov/nx-oc'}`);
    await deploymentGenerator(
      host, 
      {
        ...options, 
        project: normalizedOptions.projectName, 
        frontend: false
      }
    );
  }
}
