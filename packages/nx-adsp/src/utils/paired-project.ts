import {
  names,
  readJson,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
  writeJson,
} from '@nx/devkit';
import * as path from 'path';
import { DEFAULT_EXPRESS_SERVICE_PORT } from './express-service-port';
import { DEFAULT_FRONTEND_APP_PORT } from './frontend-app-port';
import { NginxProxyConfiguration } from './nginx';

export interface PairedProjectProxy {
  proxy: NginxProxyConfiguration;
  tag: string;
}

type DevProxyEntry = {
  target: string;
  secure: boolean;
  changeOrigin: boolean;
  pathRewrite: Record<string, string>;
};

// Builds the dev-server proxy JSON (vite.proxy.json / proxy.conf.json) from a set of nginx
// proxy entries. Shared by vue-app, react-app, angular-app, and the retroactive express-service
// proxy wiring so the format stays consistent.
export function buildDevProxyConf(
  nginxProxies: NginxProxyConfiguration[],
): Record<string, DevProxyEntry> {
  return nginxProxies.reduce(
    (proxyConf, nginxProxy) => {
      const upstreamUrl = new URL(nginxProxy.proxyPass);
      const entry: DevProxyEntry = {
        target: `${upstreamUrl.protocol}//localhost${upstreamUrl.port ? ':' + upstreamUrl.port : ''}`,
        secure: upstreamUrl.protocol === 'https:',
        changeOrigin: false,
        pathRewrite:
          upstreamUrl.pathname.length > 1
            ? { [`^${nginxProxy.location}`]: upstreamUrl.pathname }
            : {},
      };
      return { ...proxyConf, [nginxProxy.location]: entry };
    },
    {} as Record<string, DevProxyEntry>,
  );
}

const PAIRED_PROJECT_LOCATION = '/api/';

// Resolves a frontend's --pairedProject into the nginx/dev-server proxy entry that routes API
// calls to it, plus the `adsp:proxy-service:<name>:<port>` tag the sandbox executor reads to
// pre-create the backend's Service before this frontend's nginx starts (nginx resolves
// proxy_pass upstreams at startup, so a missing Service would crashloop the pod — only the
// Service is needed, for DNS, not the backend's deployment). Throws if the named project doesn't
// exist yet — a paired reference only makes sense pointing at something already scaffolded, the
// same convention project-docs-ancestors uses elsewhere in this workspace.
export function resolvePairedProjectProxy(
  host: Tree,
  pairedProject: string | undefined,
): PairedProjectProxy | undefined {
  if (!pairedProject) {
    return undefined;
  }
  const pairedService = names(pairedProject).fileName;
  readProjectConfiguration(host, pairedService);
  const port = DEFAULT_EXPRESS_SERVICE_PORT;
  return {
    proxy: {
      location: PAIRED_PROJECT_LOCATION,
      proxyPass: `http://${pairedService}:${port}/${pairedService}/`,
    },
    tag: `adsp:proxy-service:${pairedService}:${port}`,
  };
}

export interface PairedFrontendApp {
  tag: string;
}

// Resolves an express-service's --pairedProject into the `adsp:paired-frontend:<name>:<port>`
// tag tooling reads to discover which frontend app this service is paired with. Unlike
// resolvePairedProjectProxy, this does NOT validate that the paired project exists: composite
// generators (pevn, pern, pean) scaffold express-service first and the frontend second, so the
// frontend's project configuration is not yet in the tree when this runs. The tag is fully
// derived from the name alone — no reads from the paired project are required.
export function resolvePairedFrontendApp(
  host: Tree,
  pairedProject: string | undefined,
): PairedFrontendApp | undefined {
  if (!pairedProject) {
    return undefined;
  }
  const pairedApp = names(pairedProject).fileName;
  return {
    tag: `adsp:paired-frontend:${pairedApp}:${DEFAULT_FRONTEND_APP_PORT}`,
  };
}

// Retroactively applies proxy wiring to an existing frontend when an express-service is generated
// after it with --pairedProject. This is the mirror of what resolvePairedProjectProxy + the
// frontend generator does when the frontend runs first. Safe to call when the frontend doesn't
// exist yet (composite generator ordering — backend is scaffolded before frontend); returns early.
export function applyProxyToExistingFrontend(
  host: Tree,
  pairedFrontend: string,
  backendProjectName: string,
): void {
  const frontendName = names(pairedFrontend).fileName;
  let frontendConfig;
  try {
    frontendConfig = readProjectConfiguration(host, frontendName);
  } catch {
    // Frontend not scaffolded yet (composite generator ordering).
    return;
  }

  const projectRoot = frontendConfig.root;
  const port = DEFAULT_EXPRESS_SERVICE_PORT;
  const backendService = names(backendProjectName).fileName;
  const nginxProxy: NginxProxyConfiguration = {
    location: PAIRED_PROJECT_LOCATION,
    proxyPass: `http://${backendService}:${port}/${backendService}/`,
  };

  // Detect Vue vs React/Angular by nginx.conf location: Vue emits into public/ (Vite publicDir
  // so it lands in the build output root automatically); React and Angular both emit at the
  // project root and add an explicit webpack build asset glob.
  const isVue = host.exists(path.join(projectRoot, 'public', 'nginx.conf'));
  const isRootNginx = !isVue && host.exists(path.join(projectRoot, 'nginx.conf'));
  if (!isVue && !isRootNginx) {
    return;
  }

  // 1. Patch nginx.conf — insert the proxy block before the server block's closing brace.
  const nginxConfPath = isVue
    ? path.join(projectRoot, 'public', 'nginx.conf')
    : path.join(projectRoot, 'nginx.conf');
  const existingNginx = host.read(nginxConfPath)?.toString() ?? '';
  if (!existingNginx.includes(`location ${nginxProxy.location}`)) {
    const proxyBlock = [
      `    location ${nginxProxy.location} {`,
      `      proxy_pass ${nginxProxy.proxyPass};`,
      `      proxy_set_header Host $host;`,
      `      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
      `      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;`,
      `    }`,
      ``,
    ].join('\n');
    // Find the server block's closing brace (2-space indent — distinct from location
    // blocks at 4-space indent) and insert the proxy block before it.
    const serverCloseIdx = existingNginx.lastIndexOf('\n  }');
    if (serverCloseIdx !== -1) {
      host.write(
        nginxConfPath,
        existingNginx.slice(0, serverCloseIdx) +
          '\n' +
          proxyBlock +
          existingNginx.slice(serverCloseIdx),
      );
    }
  }

  // 2. Write (or merge into) the dev proxy config file.
  const devProxyFilename = isVue ? 'vite.proxy.json' : 'proxy.conf.json';
  const devProxyPath = path.join(projectRoot, devProxyFilename);
  const existingProxy = host.exists(devProxyPath)
    ? readJson<Record<string, unknown>>(host, devProxyPath)
    : {};
  if (!existingProxy[nginxProxy.location]) {
    writeJson(host, devProxyPath, {
      ...existingProxy,
      ...buildDevProxyConf([nginxProxy]),
    });
  }

  // 3. Patch the frontend's project configuration.
  const proxyTag = `adsp:proxy-service:${backendService}:${port}`;
  if (!(frontendConfig.tags ?? []).includes(proxyTag)) {
    frontendConfig.tags = [...(frontendConfig.tags ?? []), proxyTag];
  }

  if (
    frontendConfig.targets?.serve?.options &&
    !frontendConfig.targets.serve.options.proxyConfig
  ) {
    frontendConfig.targets.serve.options = {
      ...frontendConfig.targets.serve.options,
      proxyConfig: devProxyPath,
    };
  }

  // React/Angular only: add nginx.conf as a webpack build asset so it lands in the output root.
  // Vue's @nx/vite:build copies public/ automatically — no asset glob needed.
  if (isRootNginx && frontendConfig.targets?.build?.options) {
    const assets: unknown[] = frontendConfig.targets.build.options.assets ?? [];
    const hasNginxAsset = assets.some(
      (a) =>
        typeof a === 'object' &&
        (a as { glob?: string }).glob === 'nginx.conf' &&
        (a as { input?: string }).input === projectRoot,
    );
    if (!hasNginxAsset) {
      frontendConfig.targets.build.options = {
        ...frontendConfig.targets.build.options,
        assets: [...assets, { glob: 'nginx.conf', input: projectRoot, output: './' }],
      };
    }
  }

  updateProjectConfiguration(host, frontendName, frontendConfig);
}
