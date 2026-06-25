import { deploymentGenerator, getAdspConfiguration } from '@abgov/nx-oc';
import { confirmAfterAgentInterrupt, consultAgent } from '../../utils/agent';
import { ensureAudienceMapper, ensureClientRoleScope, ensurePublicClient } from '../../utils/keycloak-admin';
import { PLUGIN_VERSION } from '../../utils/plugin-version';
import { addJestCoverageConfig, addSemgrepTarget, addVsCodeSettings } from '../../utils/quality';
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


export default async function (host: Tree, options: AngularAppGeneratorSchema) {
  const normalizedOptions = await normalizeOptions(host, options);

  const { applicationGenerator: initAngular } = await import(
    '@nx/angular/generators'
  );
  await initAngular(host, {
    name: options.name,
    prefix: normalizedOptions.projectName,
    linter: 'none',
    directory: normalizedOptions.projectRoot,
    skipFormat: true,
  });

  addDependenciesToPackageJson(
    host,
    {
      '@abgov/angular-components': '5.2.1',
      '@abgov/design-tokens': '1.8.0',
      '@abgov/ui-components-common': '^2.0.0',
      '@abgov/web-components': '1.39.3',
      'keycloak-angular': '^19.0.2',
      'keycloak-js': '^23.0.7',
      'zone.js': '~0.15.0',
    },
    {}
  );

  const addedProxy = addFiles(host, normalizedOptions);

  addJestCoverageConfig(host, normalizedOptions.projectRoot);
  addVsCodeSettings(host);

  // @nx/angular generates app.ts/html/css/spec.ts (new naming) and nx-welcome.ts;
  // our templates use app.component.* and don't use nx-welcome.
  for (const file of ['app.ts', 'app.html', 'app.css', 'app.spec.ts', 'nx-welcome.ts']) {
    host.delete(`${normalizedOptions.projectRoot}/src/app/${file}`);
  }

  const config = readProjectConfiguration(host, options.name);

  // Remove the generated fileReplacements for production — single environment.ts
  // is pre-populated from tenant config at generation time.
  if (config.targets.build.configurations?.production?.fileReplacements) {
    delete config.targets.build.configurations.production.fileReplacements;
  }

  config.targets.build.options = {
    ...config.targets.build.options,
    polyfills: ['zone.js'],
    assets: [
      ...config.targets.build.options.assets,
      `${normalizedOptions.projectRoot}/src/silent-check-sso.html`,
      {
        glob: 'nginx.conf',
        input: normalizedOptions.projectRoot,
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

  addSemgrepTarget(host, options.name);
  await formatFiles(host);

  if (normalizedOptions.adsp) {
    const accessToken = normalizedOptions.adsp.accessToken ?? options.accessToken;
    const clientId = `urn:ads:${normalizedOptions.adsp.tenant}:${normalizedOptions.projectName}`;
    await ensurePublicClient(
      normalizedOptions.adsp.accessServiceUrl,
      normalizedOptions.adsp.tenantRealm,
      clientId,
      accessToken
    );
    if (options.serviceClientId) {
      await ensureAudienceMapper(
        normalizedOptions.adsp.accessServiceUrl,
        normalizedOptions.adsp.tenantRealm,
        clientId,
        options.serviceClientId,
        accessToken
      );
      await ensureClientRoleScope(
        normalizedOptions.adsp.accessServiceUrl,
        normalizedOptions.adsp.tenantRealm,
        clientId,
        options.serviceClientId,
        'example-role',
        accessToken
      );
    }
  }

  if (normalizedOptions.adsp && !options.skipAgent) {
    const accessToken = normalizedOptions.adsp.accessToken ?? options.accessToken;
    const appComponentTs = host.read(`${normalizedOptions.projectRoot}/src/app/app.component.ts`)?.toString() ?? '';
    const appComponentHtml = host.read(`${normalizedOptions.projectRoot}/src/app/app.component.html`)?.toString() ?? '';
    const appConfigTs = host.read(`${normalizedOptions.projectRoot}/src/app/app.config.ts`)?.toString() ?? '';
    const appRoutesTs = host.read(`${normalizedOptions.projectRoot}/src/app/app.routes.ts`)?.toString() ?? '';
    const environmentTs = host.read(`${normalizedOptions.projectRoot}/src/environments/environment.ts`)?.toString() ?? '';
    await confirmAfterAgentInterrupt(await consultAgent(
      normalizedOptions.adsp.directoryServiceUrl,
      accessToken,
      {
        projectName: normalizedOptions.projectName,
        projectType: 'angular-app',
        tenant: normalizedOptions.adsp.tenant,
        pluginVersion: PLUGIN_VERSION,
        existingFiles: {
          'src/app/app.component.ts': appComponentTs,
          'src/app/app.component.html': appComponentHtml,
          'src/app/app.config.ts': appConfigTs,
          'src/app/app.routes.ts': appRoutesTs,
          'src/environments/environment.ts': environmentTs,
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
