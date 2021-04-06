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
  writeJson,
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

  const addProxyConf = options.nginxProxies.length > 0;
  if (addProxyConf) {
    // Add a webpack dev server proxy configuration ...
    // TODO: Is this cleaner to add via template?
    const devProxyConf = options.nginxProxies.reduce(
      (proxyConf, nginxProxy) => {
        const upstreamUrl = new URL(nginxProxy.proxyPass);
        
        const proxy = {
          target: `${upstreamUrl.protocol}//${upstreamUrl.hostname}${upstreamUrl.port ? ':' + upstreamUrl.port : ''}`,
          secure: upstreamUrl.protocol === 'https:',
          changeOrigin: true,
          pathRewrite: {}
        }

        // If there is a path on the upstream url, then add a rewrite.
        if (upstreamUrl.pathname.length > 1) {
          proxy.pathRewrite = {
            [`^${nginxProxy.location}`]: upstreamUrl.pathname
          }
        }

        return {
          ...proxyConf,
          [nginxProxy.location]: proxy
        }
      }, 
      {}
    );

    writeJson(
      host, 
      `${options.projectRoot}/proxy.conf.json`,
      devProxyConf
    );
  }
  return addProxyConf;
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
      '@types/react-router-dom': '~5.1.7',
      "@types/redux-mock-store": "~1.0.2",
      'html-webpack-plugin': '~4.5.2',
      'oidc-client': '~1.11.5',
      'redux-oidc': '~4.0.0-beta1',
      'react-router-dom': '~5.2.0',
      'redux-mock-store': '~1.5.4'
    }
  )
  
  const addedProxy = addFiles(host, normalizedOptions);
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
    webpackConfig: `${normalizedOptions.projectRoot}/webpack.conf.js`,
  }

  if (addedProxy) {
    // Add the webpack dev server proxy if there is proxy configuration.
    config.targets.serve.options = {
      ...config.targets.serve.options,
      proxyConfig: `${normalizedOptions.projectRoot}/proxy.conf.json`
    }
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
