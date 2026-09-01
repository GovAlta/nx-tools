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
  offsetFromRoot,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
  writeJson,
} from '@nx/devkit';
import * as path from 'path';
import {
  buildDevProxyConf,
  resolvePairedProjectProxy,
} from '../../utils/paired-project';
import { generateNginxConf } from '../../utils/nginx';
import { disableSlotAttributeRule } from '../../utils/vue-eslint';
import vueComponentsGenerator, {
  vueComponentsImportPath,
} from '../vue-components/vue-components';
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
    layout: options.layout ?? 'header',
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    pairedProject: options.pairedProject ?? null,
    // Import specifier for the shared GoA wrapper lib (AGENTS.md references it).
    goaImportPath: vueComponentsImportPath(host),
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions,
  );

  host.write(
    `${options.projectRoot}/public/nginx.conf`,
    generateNginxConf({
      proxyLocations: options.nginxProxies,
      silentCheckSso: true,
    }),
  );

  const addProxyConf = options.nginxProxies.length > 0;
  if (addProxyConf) {
    writeJson(
      host,
      `${options.projectRoot}/vite.proxy.json`,
      buildDevProxyConf(options.nginxProxies),
    );
  }
  return addProxyConf;
}

export default async function (host: Tree, options: Schema) {
  // Checked before normalizeOptions, which resolves ADSP auth and can trigger
  // an interactive login — a missing peer shouldn't surface only after that.
  const { applicationGenerator: initVue } = await import('@nx/vue').catch(
    () => {
      throw new Error(
        "The 'vue-app' generator requires the '@nx/vue' plugin. Install it and re-run:\n  npm i -D @nx/vue",
      );
    },
  );

  const normalizedOptions = await normalizeOptions(host, options);

  await initVue(host, {
    name: options.name,
    style: 'css',
    skipFormat: true,
    linter: 'eslint',
    unitTestRunner: 'vitest',
    e2eTestRunner: 'playwright',
    routing: true,
    directory: normalizedOptions.projectRoot,
  });

  // Let the Playwright e2e target the deployed URL (BASE_URL) in CI instead of
  // always starting a local dev server — see the nx-oc pipeline's e2e jobs.
  guardPlaywrightWebServer(host, `${normalizedOptions.projectRoot}-e2e`);
  addAxeAccessibilityCheck(host, `${normalizedOptions.projectRoot}-e2e`);

  // Ensure the shared GoA wrapper library exists (idempotent — created once per
  // workspace, refreshed on later runs). Apps import it instead of each carrying
  // their own copy. This stays the long-term approach, not a stopgap: the
  // published @abgov/vue-components package (checked directly) is an abandoned
  // Vue 2 relic from 2021 across every dist-tag (latest/next/alpha/beta) — not a
  // real current alternative — and GoA's own design-system docs don't list Vue
  // as a supported framework at all.
  await vueComponentsGenerator(host);

  // The shell projects into goa-one-column-layout's native `header`/`footer`
  // slots, and app authors composing goa-* elements need the same attribute
  // (goa-modal's `actions`, goa-app-header's `utilities`). Applied to both
  // layouts, not just the one whose template emits it today -- scoping this to
  // the single known call site is what let `nx lint` start failing on
  // unmodified output when the shell adopted goa-one-column-layout.
  disableSlotAttributeRule(
    host,
    normalizedOptions.projectRoot,
    "The app shell projects into goa-one-column-layout's native `slot`",
  );

  addDependenciesToPackageJson(
    host,
    {
      '@abgov/design-tokens': '2.12.8',
      '@abgov/web-components': '2.4.0',
      // keycloak-js is a transitive dependency of @dsb-norge/vue-keycloak-js;
      // don't pin it directly or the versions diverge into two copies.
      '@dsb-norge/vue-keycloak-js': '^3.0.0',
      pinia: '^2.0.0',
      'vue-router': '^4.0.0',
    },
    {
      '@axe-core/playwright': '^4.12.1',
      'eslint-plugin-security': '^3.0.0',
      'eslint-plugin-no-secrets': '^2.0.0',
    },
  );

  // Remove Nx scaffold files replaced by our templates. @nx/vue (Nx 23) scaffolds
  // its demo under src/app/ (App.vue, App.spec.ts, NxWelcome.vue) and emits
  // vite.config.mts; we provide our own App.vue (at src root), views, and a
  // GoA-aware vite.config.ts. Drop the demo + its now-stale test (which fails
  // against our shell) and the duplicate config. Paths from older @nx/vue
  // layouts are kept for safety — host.delete is a no-op when they're absent.
  for (const f of [
    'src/App.vue',
    'src/app/App.vue',
    'src/app/App.spec.ts',
    'src/app/NxWelcome.vue',
    'src/components/HelloWorld.vue',
    // AppLayout now lives in the shared vue-components lib (patterns/) —
    // remove a stale copy from an app scaffolded before that move.
    'src/components/AppLayout.vue',
    'src/views/AboutView.vue',
    'vite.config.mts',
  ]) {
    if (host.exists(`${normalizedOptions.projectRoot}/${f}`)) {
      host.delete(`${normalizedOptions.projectRoot}/${f}`);
    }
  }

  const addedProxy = addFiles(host, normalizedOptions);

  addJestCoverageConfig(host, normalizedOptions.projectRoot);
  // nx-adsp's own workspace-root setup (ADSP SDK MCP server + shared VS Code
  // settings), run as one step here in case `nx-adsp:init` hasn't been run
  // standalone yet.
  await initGenerator(host);

  const config = readProjectConfiguration(host, options.name);

  // Wire the vite dev-server proxy when nginx proxy locations are configured.
  if (addedProxy && config.targets.serve?.options) {
    config.targets.serve.options = {
      ...config.targets.serve.options,
      proxyConfig: `${normalizedOptions.projectRoot}/vite.proxy.json`,
    };
  }

  // nginx.conf lives in the Vite publicDir
  // (<projectRoot>/public) so it's emitted to the build output root — the
  // @nx/vite:build executor ignores webpack-style `assets`. Pin outputPath to
  // the workspace-root dist so it matches the vite config's outDir and the
  // generated Dockerfile's COPY path.
  if (config.targets.build?.options) {
    config.targets.build.options = {
      ...config.targets.build.options,
      outputPath: `dist/${normalizedOptions.projectRoot}`,
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
    const appVue =
      host.read(`${normalizedOptions.projectRoot}/src/App.vue`)?.toString() ??
      '';
    const mainTs =
      host.read(`${normalizedOptions.projectRoot}/src/main.ts`)?.toString() ??
      '';
    const routerTs =
      host
        .read(`${normalizedOptions.projectRoot}/src/router/index.ts`)
        ?.toString() ?? '';
    const environmentTs =
      host
        .read(
          `${normalizedOptions.projectRoot}/src/environments/environment.ts`,
        )
        ?.toString() ?? '';
    await confirmAfterAgentInterrupt(
      await consultAgent(
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
