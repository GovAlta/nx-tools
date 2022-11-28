import {
  getWorkspaceLayout,
  getWorkspacePath,
  installPackagesTask,
  names,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { getAdspConfiguration } from '../../utils/adsp-utils';
import initDotnetService from '../dotnet-service/dotnet-service';
import initReactApp from '../react-app/react-app';
import { NormalizedSchema, Schema } from './schema';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const name = names(options.name).fileName;
  const projectDirectory = name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectDirectory}`;

  const openshiftDirectory = `${path.dirname(
    getWorkspacePath(host)
  )}/.openshift/${projectDirectory}`;

  const adsp = await getAdspConfiguration(host, options);

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    openshiftDirectory,
    adsp,
  };
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = await normalizeOptions(host, options);

  await initDotnetService(host, {
    ...normalizedOptions,
    name: `${options.name}-service`,
  });

  await initReactApp(host, {
    ...normalizedOptions,
    name: `${options.name}-app`,
    proxy: {
      location: '/api/',
      proxyPass: `http://${options.name}-service:5000/${options.name}-service/`,
    },
  });

  return () => {
    installPackagesTask(host);
  };
}
