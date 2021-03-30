import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import { wrapAngularDevkitSchematic } from '@nrwl/devkit/ngcli-adapter';
import * as path from 'path';
import { getAdspConfiguration, hasDependency } from '../../utils/adsp-utils';
import { NormalizedSchema, Schema } from './schema';

function normalizeOptions(
  host: Tree,
  options: Schema
): NormalizedSchema {
  const projectName = names(options.name).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;
  const openshiftDirectory = `.openshift/${projectName}`
  
  const adsp = getAdspConfiguration(host, options);

  const nginxProxies = Array.isArray(options.proxy) ?
    [...options.proxy] :
    (
      options.proxy ? 
        [options.proxy] : 
        []
    );

  return {
    ...options,
    projectName,
    projectRoot,
    openshiftDirectory,
    adsp,
    nginxProxies
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

function removeFiles(host: Tree, options: NormalizedSchema) {
  host.delete(`${options.projectRoot}/src/app/logo.svg`);
  host.delete(`${options.projectRoot}/src/app/star.svg`);
}

export default async function (host: Tree, options: Schema) {
  
  const normalizedOptions = normalizeOptions(host, options);
  
  const initReact = wrapAngularDevkitSchematic('@nrwl/react', 'application');
  const initRedux = wrapAngularDevkitSchematic('@nrwl/react', 'redux');
  
  await initReact(host, options);
  await initRedux(host, {...options, name: 'intake', project: options.name});
  
  addDependenciesToPackageJson(
    host, 
    {
    },
    {
      '@abgov/core-css': '^0.7.56',
      '@abgov/react-components': '^0.7.56',
      'html-webpack-plugin': '~4.5.2',
      'oidc-client': '~1.11.5',
      'redux-oidc': '~4.0.0-beta1'
    }
  )
  
  addFiles(host, normalizedOptions);
  removeFiles(host, normalizedOptions);

  await formatFiles(host);

  const layout = getWorkspaceLayout(host);

  const config = readProjectConfiguration(host, options.name);
  config.targets.build.options = {
    ...config.targets.build.options,
    assets: [
      ...config.targets.build.options.assets,
      {
        "glob": "nginx.conf",
        "input": `${layout.appsDir}/${options.name}`,
        "output": "./"
      }
    ],
    webpackConfig: `${layout.appsDir}/${options.name}/webpack.conf.js`,
  }
  updateProjectConfiguration(host, options.name, config);

  if (hasDependency(host, '@abgov/nx-oc')) {
    const { deploymentGenerator } = await import(`${'@abgov/nx-oc'}`);
    await deploymentGenerator(
      host, 
      {
        ...options, 
        project: normalizedOptions.projectName, 
        frontend: true
      }
    );
  }

  return () => {
    installPackagesTask(host);
  }
}
