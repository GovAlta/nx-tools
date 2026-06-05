import { deploymentGenerator, getAdspConfiguration } from '@abgov/nx-oc';
import { confirmAfterAgentInterrupt, consultAgent } from '../../utils/agent';
import { PLUGIN_VERSION } from '../../utils/plugin-version';
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
} from '@nx/devkit';
import { Linter } from '@nx/eslint';
import * as path from 'path';
import { NormalizedSchema, Schema } from './schema';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const projectName = names(options.name).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;
  const openshiftDirectory = `.openshift/${projectName}`;

  const adsp = await getAdspConfiguration(host, options);

  const nginxProxies = Array.isArray(options.proxy)
    ? [...options.proxy]
    : options.proxy
    ? [options.proxy]
    : [];

  return {
    ...options,
    projectName,
    projectRoot,
    openshiftDirectory,
    adsp,
    nginxProxies,
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
          target: `${upstreamUrl.protocol}//localhost${
            upstreamUrl.port ? ':' + upstreamUrl.port : ''
          }`,
          secure: upstreamUrl.protocol === 'https:',
          changeOrigin: false,
          pathRewrite: {},
        };

        // If there is a path on the upstream url, then add a rewrite.
        if (upstreamUrl.pathname.length > 1) {
          proxy.pathRewrite = {
            [`^${nginxProxy.location}`]: upstreamUrl.pathname,
          };
        }

        return {
          ...proxyConf,
          [nginxProxy.location]: proxy,
        };
      },
      {}
    );

    writeJson(host, `${options.projectRoot}/proxy.conf.json`, devProxyConf);
  }
  return addProxyConf;
}

function removeFiles(host: Tree, options: NormalizedSchema) {
  host.delete(`${options.projectRoot}/src/app/logo.svg`);
  host.delete(`${options.projectRoot}/src/app/star.svg`);
  host.delete(`${options.projectRoot}/src/app/nx-welcome.tsx`);
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = await normalizeOptions(host, options);

  const { applicationGenerator: initReact } = await import('@nx/react');

  // Setting strict to false because of: https://github.com/nrwl/nx/issues/8180
  await initReact(host, {
    name: options.name,
    style: 'css',
    skipFormat: true,
    linter: Linter.EsLint,
    unitTestRunner: 'jest',
    e2eTestRunner: 'cypress',
    strict: false,
    directory: `apps/${options.name}`,
  });

  addDependenciesToPackageJson(
    host,
    {
      '@abgov/design-tokens': '1.8.0',
      '@abgov/react-components': '6.10.0',
      '@abgov/web-components': '1.39.3',
      '@reduxjs/toolkit': '^2.5.1',
      'keycloak-js': '^23.0.7',
      'react-redux': '^9.2.0',
      'react-router-dom': '6.30.3',
    },
    {
      'html-webpack-plugin': '~5.5.0',
      'redux-mock-store': '~1.5.4',
    }
  );

  const addedProxy = addFiles(host, normalizedOptions);
  removeFiles(host, normalizedOptions);

  const layout = getWorkspaceLayout(host);
  const config = readProjectConfiguration(host, options.name);

  // Remove the generated fileReplacements for production — we use a single
  // environment.ts with runtime env vars rather than a build-time swap.
  if (config.targets.build.configurations?.production?.fileReplacements) {
    delete config.targets.build.configurations.production.fileReplacements;
  }

  config.targets.build.options = {
    ...config.targets.build.options,
    assets: [
      ...config.targets.build.options.assets,
      {
        glob: 'nginx.conf',
        input: `${layout.appsDir}/${options.name}`,
        output: './',
      },
    ],
    webpackConfig: `${normalizedOptions.projectRoot}/webpack.config.js`,
  };

  if (addedProxy) {
    // Add the webpack dev server proxy if there is proxy configuration.
    config.targets.serve.options = {
      ...config.targets.serve.options,
      proxyConfig: `${normalizedOptions.projectRoot}/proxy.conf.json`,
    };
  }

  updateProjectConfiguration(host, options.name, config);

  await formatFiles(host);

  if (normalizedOptions.adsp && !options.skipAgent) {
    const accessToken = normalizedOptions.adsp.accessToken ?? options.accessToken;
    const appTs = host.read(`${normalizedOptions.projectRoot}/src/app/app.tsx`)?.toString() ?? '';
    const storeTs = host.read(`${normalizedOptions.projectRoot}/src/store.ts`)?.toString() ?? '';
    const environmentTs = host.read(`${normalizedOptions.projectRoot}/src/environments/environment.ts`)?.toString() ?? '';
    const configSliceTs = host.read(`${normalizedOptions.projectRoot}/src/app/config.slice.ts`)?.toString() ?? '';
    const intakeSliceTs = host.read(`${normalizedOptions.projectRoot}/src/app/intake.slice.ts`)?.toString() ?? '';
    await confirmAfterAgentInterrupt(await consultAgent(
      normalizedOptions.adsp.directoryServiceUrl,
      accessToken,
      {
        projectName: normalizedOptions.projectName,
        projectType: 'react-app',
        tenant: normalizedOptions.adsp.tenant,
        pluginVersion: PLUGIN_VERSION,
        existingFiles: {
          'src/app/app.tsx': appTs,
          'src/store.ts': storeTs,
          'src/environments/environment.ts': environmentTs,
          'src/app/config.slice.ts': configSliceTs,
          'src/app/intake.slice.ts': intakeSliceTs,
        },
      },
      host,
      normalizedOptions.projectRoot
    ));
  }

  await deploymentGenerator(host, {
    ...normalizedOptions,
    appType: 'frontend',
    project: normalizedOptions.projectName,
  });

  return () => {
    installPackagesTask(host);
  };
}
