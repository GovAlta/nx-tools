import { names, readProjectConfiguration, Tree } from '@nx/devkit';
import { DEFAULT_EXPRESS_SERVICE_PORT } from './express-service-port';
import { DEFAULT_FRONTEND_APP_PORT } from './frontend-app-port';
import { NginxProxyConfiguration } from './nginx';

export interface PairedProjectProxy {
  proxy: NginxProxyConfiguration;
  tag: string;
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
