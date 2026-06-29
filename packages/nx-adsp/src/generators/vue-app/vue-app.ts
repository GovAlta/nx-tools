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
import { NormalizedSchema, Schema } from './schema';

async function normalizeOptions(host: Tree, options: Schema): Promise<NormalizedSchema> {
  const projectName = names(options.name).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;
  const openshiftDirectory = `.openshift/${projectName}`;
  const adsp = await getAdspConfiguration(host, options);
  const nginxProxies = Array.isArray(options.proxy)
    ? [...options.proxy]
    : options.proxy
    ? [options.proxy]
    : [];
  return { ...options, projectName, projectRoot, openshiftDirectory, adsp, nginxProxies };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    pairedProject: options.pairedProject ?? null,
    tmpl: '',
  };
  generateFiles(host, path.join(__dirname, 'files'), options.projectRoot, templateOptions);

  const addProxyConf = options.nginxProxies.length > 0;
  if (addProxyConf) {
    const devProxyConf = options.nginxProxies.reduce((proxyConf, nginxProxy) => {
      const upstreamUrl = new URL(nginxProxy.proxyPass);
      const proxy = {
        target: `${upstreamUrl.protocol}//localhost${upstreamUrl.port ? ':' + upstreamUrl.port : ''}`,
        secure: upstreamUrl.protocol === 'https:',
        changeOrigin: false,
        pathRewrite: {},
      };
      if (upstreamUrl.pathname.length > 1) {
        proxy.pathRewrite = { [`^${nginxProxy.location}`]: upstreamUrl.pathname };
      }
      return { ...proxyConf, [nginxProxy.location]: proxy };
    }, {});
    writeJson(host, `${options.projectRoot}/vite.proxy.json`, devProxyConf);
  }
  return addProxyConf;
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = await normalizeOptions(host, options);

  const { applicationGenerator: initVue } = await import('@nx/vue');
  await initVue(host, {
    name: options.name,
    style: 'css',
    skipFormat: true,
    linter: 'eslint',
    unitTestRunner: 'vitest',
    e2eTestRunner: 'none',
    routing: true,
    directory: normalizedOptions.projectRoot,
  });

  addDependenciesToPackageJson(
    host,
    {
      '@abgov/design-tokens': '1.8.0',
      '@abgov/web-components': '1.39.3',
      '@dsb-norge/vue-keycloak-js': '^3.0.0',
      'keycloak-js': '^23.0.7',
      'pinia': '^2.0.0',
      'vue-router': '^4.0.0',
    },
    {
      'eslint-plugin-security': '^3.0.0',
      'eslint-plugin-no-secrets': '^2.0.0',
    }
  );

  // Remove Nx scaffold files replaced by our templates.
  for (const f of [
    'src/App.vue',
    'src/components/HelloWorld.vue',
    'src/views/AboutView.vue',
  ]) {
    if (host.exists(`${normalizedOptions.projectRoot}/${f}`)) {
      host.delete(`${normalizedOptions.projectRoot}/${f}`);
    }
  }

  const addedProxy = addFiles(host, normalizedOptions);

  addJestCoverageConfig(host, normalizedOptions.projectRoot);
  addVsCodeSettings(host);

  const config = readProjectConfiguration(host, options.name);

  // Wire the vite dev-server proxy when nginx proxy locations are configured.
  if (addedProxy && config.targets.serve?.options) {
    config.targets.serve.options = {
      ...config.targets.serve.options,
      proxyConfig: `${normalizedOptions.projectRoot}/vite.proxy.json`,
    };
  }

  // Ensure silent-check-sso.html is served as a static asset.
  if (config.targets.build?.options) {
    config.targets.build.options = {
      ...config.targets.build.options,
      assets: [
        ...(config.targets.build.options.assets ?? []),
        {
          glob: 'nginx.conf',
          input: normalizedOptions.projectRoot,
          output: './',
        },
      ],
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
    const appVue = host.read(`${normalizedOptions.projectRoot}/src/App.vue`)?.toString() ?? '';
    const mainTs = host.read(`${normalizedOptions.projectRoot}/src/main.ts`)?.toString() ?? '';
    const routerTs = host.read(`${normalizedOptions.projectRoot}/src/router/index.ts`)?.toString() ?? '';
    const environmentTs = host.read(`${normalizedOptions.projectRoot}/src/environments/environment.ts`)?.toString() ?? '';
    await confirmAfterAgentInterrupt(await consultAgent(
      normalizedOptions.adsp.directoryServiceUrl,
      accessToken,
      {
        projectName: normalizedOptions.projectName,
        projectType: 'vue-app',
        tenant: normalizedOptions.adsp.tenant,
        pluginVersion: PLUGIN_VERSION,
        existingFiles: {
          'src/App.vue': appVue,
          'src/main.ts': mainTs,
          'src/router/index.ts': routerTs,
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
