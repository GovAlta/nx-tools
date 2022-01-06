import {
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  getWorkspacePath,
  installPackagesTask,
  names,
  offsetFromRoot,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { getAdspConfiguration } from '../../utils/adsp-utils';
import initExpressService from '../express-service/express-service';
import initReactApp from '../react-app/react-app';
import { Schema, NormalizedSchema } from './schema';

function normalizeOptions(
  host: Tree,
  options: Schema
): NormalizedSchema {
  const name = names(options.name).fileName;
  const projectDirectory = name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectDirectory}`;
  
  const openshiftDirectory = 
    `${path.dirname(getWorkspacePath(host))}/.openshift/${projectDirectory}`
  
  const adsp = getAdspConfiguration(host, options);

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    openshiftDirectory,
    adsp
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    template: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
  generateFiles(
    host,
    path.join(__dirname, 'openshift'),
    `${options.openshiftDirectory}`,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  
  const normalizedOptions = normalizeOptions(host, options);
  
  await initExpressService(
    host, 
    {
      ...options, 
      name: `${options.name}-service`
    }
  );
  
  await initReactApp(
    host, 
    {
      ...options, 
      name: `${options.name}-app`,
      proxy: {
        location: '/api/',
        proxyPass: `http://${options.name}-service:3333/${options.name}-service/`
      }
    }
  );
  
  // Currently no files specific to MERN generator.
  // addFiles(host, normalizedOptions);
  await formatFiles(host);

  return () => {
    installPackagesTask(host);
  }
}
