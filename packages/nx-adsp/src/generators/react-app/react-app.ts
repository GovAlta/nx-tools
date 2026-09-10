import {
  adspProjectTags,
  deploymentGenerator,
  getAdspConfiguration,
} from '@abgov/nx-oc';
import { confirmAfterAgentInterrupt, consultAgent } from '../../utils/agent';
import {
  ensureAudienceMapper,
  ensureClientRoleScope,
  ensurePublicClient,
} from '../../utils/keycloak-admin';
import { PLUGIN_VERSION } from '../../utils/plugin-version';
import {
  addAxeAccessibilityCheck,
  addEslintQualityRules,
  addJestCoverageConfig,
  addSemgrepTarget,
  guardPlaywrightWebServer,
} from '../../utils/quality';
import initGenerator from '../init/init';
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
import {
  buildDevProxyConf,
  resolvePairedProjectProxy,
} from '../../utils/paired-project';
import { generateNginxConf } from '../../utils/nginx';
import { NormalizedSchema, Schema } from './schema';

async function normalizeOptions(
  host: Tree,
  options: Schema,
): Promise<NormalizedSchema> {
  const projectName = names(options.name).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;
  const openshiftDirectory = `.openshift/${projectName}`;

  const adsp = await getAdspConfiguration(host, options);

  const explicitProxies = Array.isArray(options.proxy)
    ? [...options.proxy]
    : options.proxy
      ? [options.proxy]
      : [];
  const paired = resolvePairedProjectProxy(host, options.pairedProject);
  if (
    paired &&
    explicitProxies.some((p) => p.location === paired.proxy.location)
  ) {
    throw new Error(
      `--pairedProject already derives a proxy for "${paired.proxy.location}" — remove the ` +
        `explicit --proxy entry for that location, or give it a different location.`,
    );
  }
  const nginxProxies = paired
    ? [paired.proxy, ...explicitProxies]
    : explicitProxies;

  return {
    ...options,
    projectName,
    projectRoot,
    openshiftDirectory,
    adsp,
    nginxProxies,
    pairedProjectTag: paired?.tag,
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    pairedProject: options.pairedProject ?? null,
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions,
  );

  host.write(
    `${options.projectRoot}/nginx.conf`,
    generateNginxConf({ proxyLocations: options.nginxProxies, silentCheckSso: true }),
  );

  const addProxyConf = options.nginxProxies.length > 0;
  if (addProxyConf) {
    writeJson(
      host,
      `${options.projectRoot}/proxy.conf.json`,
      buildDevProxyConf(options.nginxProxies),
    );
  }
  return addProxyConf;
}

function removeFiles(host: Tree, options: NormalizedSchema) {
  host.delete(`${options.projectRoot}/src/app/logo.svg`);
  host.delete(`${options.projectRoot}/src/app/star.svg`);
  host.delete(`${options.projectRoot}/src/app/nx-welcome.tsx`);
}

export default async function (host: Tree, options: Schema) {
  // Checked before normalizeOptions, which resolves ADSP auth and can trigger
  // an interactive login — a missing peer shouldn't surface only after that.
  const { applicationGenerator: initReact } = await import('@nx/react').catch(
    () => {
      throw new Error(
        "The 'react-app' generator requires the '@nx/react' plugin. Install it and re-run:\n  npm i -D @nx/react",
      );
    },
  );

  const normalizedOptions = await normalizeOptions(host, options);

  // Setting strict to false because of: https://github.com/nrwl/nx/issues/8180
  await initReact(host, {
    name: options.name,
    style: 'css',
    skipFormat: true,
    linter: Linter.EsLint,
    unitTestRunner: 'jest',
    e2eTestRunner: 'playwright',
    strict: false,
    directory: normalizedOptions.projectRoot,
  });

  // Let the Playwright e2e target the deployed URL (BASE_URL) in CI instead of
  // always starting a local dev server — see the nx-oc pipeline's e2e jobs.
  guardPlaywrightWebServer(host, `${normalizedOptions.projectRoot}-e2e`);
  addAxeAccessibilityCheck(host, `${normalizedOptions.projectRoot}-e2e`);

  addDependenciesToPackageJson(
    host,
    {
      '@abgov/design-tokens': '2.12.8',
      '@abgov/react-components': '7.5.0',
      '@abgov/web-components': '2.5.0',
      '@reduxjs/toolkit': '^2.5.1',
      'keycloak-js': '^23.0.7',
      'react-redux': '^9.2.0',
      // Pinned to the newest 6.x, which is not advisory-free — the 6 and 7
      // lines differ in what they can fix, so the distinction matters:
      //   GHSA-2j2x-hqr9-3h42, GHSA-jjmj-jmhj-qwj2 — open redirect, both
      //     patched within 6.x (6.30.4 and 6.30.6 respectively).
      //   GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg — vulnerable
      //     >=6.0.0 <7.18.0, so no 6.x release clears them. Only React Router
      //     v7 does, and v7 merges react-router-dom into react-router and
      //     changes several APIs — a breaking migration for a generated app,
      //     not a version bump. Accepted in
      //     tools/audit-emitted-deps/allowlist.json, with a reviewed date.
      // Check the patched version per advisory before assuming a 6.x bump is
      // pointless: 6.30.6 does clear jjmj, which an earlier version of this
      // comment claimed had no 6.x fix.
      'react-router-dom': '6.30.6',
    },
    {
      '@axe-core/playwright': '^4.12.1',
      'html-webpack-plugin': '~5.5.0',
      'redux-mock-store': '~1.5.4',
      'eslint-plugin-security': '^3.0.0',
      'eslint-plugin-no-secrets': '^2.0.0',
      'eslint-plugin-jest': '^28.0.0',
    },
  );

  const addedProxy = addFiles(host, normalizedOptions);
  removeFiles(host, normalizedOptions);

  addEslintQualityRules(host, normalizedOptions.projectRoot, [
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.test.ts',
    '**/*.test.tsx',
  ]);
  addJestCoverageConfig(host, normalizedOptions.projectRoot);
  // nx-adsp's own workspace-root setup (ADSP SDK MCP server + shared VS Code
  // settings), run as one step here in case `nx-adsp:init` hasn't been run
  // standalone yet.
  await initGenerator(host);

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
        input: normalizedOptions.projectRoot,
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

  // Lets the sandbox generator ensure the paired backend's Service exists before this
  // frontend's nginx starts — see utils/paired-project.ts for why.
  if (normalizedOptions.pairedProjectTag) {
    config.tags = [...(config.tags ?? []), normalizedOptions.pairedProjectTag];
  }

  config.tags = [
    ...(config.tags ?? []),
    ...adspProjectTags(
      normalizedOptions.env,
      normalizedOptions.adsp.tenant,
    ).filter((tag) => !(config.tags ?? []).includes(tag)),
  ];

  updateProjectConfiguration(host, options.name, config);

  addSemgrepTarget(host, options.name);
  await formatFiles(host);

  if (normalizedOptions.adsp) {
    const accessToken =
      normalizedOptions.adsp.accessToken ?? options.accessToken;
    const clientId = `urn:ads:${normalizedOptions.adsp.tenant}:${normalizedOptions.projectName}`;
    await ensurePublicClient(
      normalizedOptions.adsp.accessServiceUrl,
      normalizedOptions.adsp.tenantRealm,
      clientId,
      accessToken,
    );
    if (options.serviceClientId) {
      await ensureAudienceMapper(
        normalizedOptions.adsp.accessServiceUrl,
        normalizedOptions.adsp.tenantRealm,
        clientId,
        options.serviceClientId,
        accessToken,
      );
      await ensureClientRoleScope(
        normalizedOptions.adsp.accessServiceUrl,
        normalizedOptions.adsp.tenantRealm,
        clientId,
        options.serviceClientId,
        'example-role',
        accessToken,
      );
    }
  }

  if (normalizedOptions.adsp && !options.skipAgent) {
    const accessToken =
      normalizedOptions.adsp.accessToken ?? options.accessToken;
    const appTs =
      host
        .read(`${normalizedOptions.projectRoot}/src/app/app.tsx`)
        ?.toString() ?? '';
    const storeTs =
      host.read(`${normalizedOptions.projectRoot}/src/store.ts`)?.toString() ??
      '';
    const environmentTs =
      host
        .read(
          `${normalizedOptions.projectRoot}/src/environments/environment.ts`,
        )
        ?.toString() ?? '';
    const configSliceTs =
      host
        .read(`${normalizedOptions.projectRoot}/src/app/config.slice.ts`)
        ?.toString() ?? '';
    const intakeSliceTs =
      host
        .read(`${normalizedOptions.projectRoot}/src/app/intake.slice.ts`)
        ?.toString() ?? '';
    await confirmAfterAgentInterrupt(
      await consultAgent(
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
        normalizedOptions.projectRoot,
      ),
    );
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
