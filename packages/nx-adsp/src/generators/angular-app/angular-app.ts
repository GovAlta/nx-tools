import { deploymentGenerator, getAdspConfiguration } from '@abgov/nx-oc';
import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  offsetFromRoot,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
  writeJson,
} from '@nx/devkit';
import * as path from 'path';
import { NormalizedSchema, AngularAppGeneratorSchema } from './schema';

async function normalizeOptions(
  host: Tree,
  options: AngularAppGeneratorSchema
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
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
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
}

export default async function (host: Tree, options: AngularAppGeneratorSchema) {
  const normalizedOptions = await normalizeOptions(host, options);

  const { applicationGenerator: initAngular } = await import(
    '@nx/angular/generators'
  );
  await initAngular(host, {
    name: options.name,
    prefix: normalizedOptions.projectName,
    linter: 'none',
  });

  addDependenciesToPackageJson(
    host,
    {},
    {
      '@abgov/angular-components': '^3.0.0',
      '@abgov/web-components': '^1.19.0',
      'oidc-client': '~1.11.5',
    }
  );

  const addedProxy = addFiles(host, normalizedOptions);
  removeFiles(host, normalizedOptions);

  const layout = getWorkspaceLayout(host);

  const config = readProjectConfiguration(host, options.name);

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

  await deploymentGenerator(host, {
    ...normalizedOptions,
    appType: 'frontend',
    project: normalizedOptions.projectName,
  });

  return () => {
    installPackagesTask(host);
  };
}
