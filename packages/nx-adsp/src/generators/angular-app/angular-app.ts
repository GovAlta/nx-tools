import { deploymentGenerator, getAdspConfiguration } from '@abgov/nx-oc';
import { confirmAfterAgentInterrupt, consultAgent } from '../../utils/agent';
import { ensureAudienceMapper, ensureClientRoleScope, ensurePublicClient } from '../../utils/keycloak-admin';
import { PLUGIN_VERSION } from '../../utils/plugin-version';
import { addJestCoverageConfig, addSemgrepTarget, addVsCodeSettings, guardPlaywrightWebServer } from '../../utils/quality';
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
    pairedProject: options.pairedProject ?? null,
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
  // Checked before normalizeOptions, which resolves ADSP auth and can trigger
  // an interactive login — a missing peer shouldn't surface only after that.
  const { applicationGenerator: initAngular } = await import(
    '@nx/angular/generators'
  ).catch(() => {
    throw new Error(
      "The 'angular-app' generator requires the '@nx/angular' plugin. Install it and re-run:\n  npm i -D @nx/angular"
    );
  });

  const normalizedOptions = await normalizeOptions(host, options);

  await initAngular(host, {
    name: options.name,
    prefix: normalizedOptions.projectName,
    linter: 'none',
    e2eTestRunner: 'playwright',
    directory: normalizedOptions.projectRoot,
    skipFormat: true,
  });

  // Let the Playwright e2e target the deployed URL (BASE_URL) in CI instead of
  // always starting a local dev server — see the nx-oc pipeline's e2e jobs.
  guardPlaywrightWebServer(host, `${normalizedOptions.projectRoot}-e2e`);

  addDependenciesToPackageJson(
    host,
    {
      '@abgov/angular-components': '5.3.0',
      '@abgov/design-tokens': '2.9.0',
      // Pin exact (not ^2.0.0): angular-components 5.3.0 imports symbols added in
      // ui-components-common 2.3.0 (e.g. GoabWorkspaceLayoutScrollState), so a
      // lower 2.x resolves and fails the build. Keep this in lockstep with the
      // angular-components version above.
      '@abgov/ui-components-common': '2.3.0',
      '@abgov/web-components': '2.3.0',
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

  // keycloak-js pushes the initial bundle above Angular's default 1 MB error budget.
  if (config.targets.build.configurations?.production) {
    config.targets.build.configurations.production.budgets = [
      { type: 'initial', maximumWarning: '2mb', maximumError: '4mb' },
      { type: 'anyComponentStyle', maximumWarning: '6kb', maximumError: '10kb' },
    ];
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
