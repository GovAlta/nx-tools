import { names, readJson, Tree } from '@nx/devkit';
import axios from 'axios';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import { getAccessToken, getStatus } from '@abgov/adsp-cli';
import { AdspConfiguration, AdspOptions } from './adsp';
import { EnvironmentName, environments } from './environments';
import { isNonInteractive } from '../utils/interactive';

interface Package {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export function hasDependency(host: Tree, dependency: string): boolean {
  const { dependencies, devDependencies }: Package = readJson(
    host,
    'package.json'
  );

  return !!dependencies?.[dependency] || !!devDependencies?.[dependency];
}

// Scope requested for generator work that provisions Keycloak (creating a
// service's OAuth client/roles, registering redirect URIs). It's an optional
// client scope on the `adsp-cli` client — only present in a token when a login
// explicitly requests it, and only effective for users who already have the
// underlying realm-admin grant. keycloak-admin.ts tolerates the 401/403 for
// everyone else, so requesting it is always safe.
export const ADSP_ADMIN_SCOPE = 'adsp-cli-admin';


/** Resolve the `adsp` binary shipped by the @abgov/adsp-cli dependency. */
function adspCliBinPath(): string {
  const require = createRequire(__filename);
  const pkgJsonPath = require.resolve('@abgov/adsp-cli/package.json');
  const binRel = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).bin?.adsp ?? 'src/main.js';
  return path.join(path.dirname(pkgJsonPath), binRel);
}

/** Drive the CLI's interactive browser login as a subprocess (the sanctioned way
 *  to trigger it — the interactive flow is intentionally not a library export).
 *  stdio is inherited so the browser-open message and the no-args tenant picker
 *  are visible to the user, exactly like the previous inline flow. */
function runAdspLogin(options: {
  env: EnvironmentName;
  realm?: string;
  tenant?: string;
  scopes: string[];
}): void {
  const args = ['login', '--env', options.env];
  if (options.realm) args.push('--realm', options.realm);
  else if (options.tenant) args.push('--tenant', options.tenant);
  for (const scope of options.scopes) args.push('--scope', scope);
  spawnSync(process.execPath, [adspCliBinPath(), ...args], { stdio: 'inherit' });
}

/**
 * Obtain an ADSP access token via @abgov/adsp-cli. Fast path: a cached/refreshed
 * token from a prior `adsp login` (no browser). If none — and the run is
 * interactive — drive `adsp login` (browser) once, then read the fresh token.
 * In a non-interactive run it never opens a browser; it throws with the exact
 * `adsp login` command to run instead.
 *
 * When `scopes` (e.g. the admin scope) can't be satisfied even after a login —
 * a user who isn't a realm admin — it falls back to a base-scope token so
 * non-provisioning steps still proceed (provisioning then degrades via 401/403).
 */
export async function ensureAdspToken(options: {
  env: EnvironmentName;
  realm?: string;
  tenant?: string;
  scopes?: string[];
}): Promise<string | undefined> {
  const { env, realm, tenant, scopes = [] } = options;
  // Force the CLI to talk to the generator's target environment. Note: we set
  // ADSP_ENV, never ADSP_TENANT_REALM — the latter would make getStatus() drop
  // the persisted tenantName (it can't trust a name against an overridden realm).
  // Default to 'test' (UAT), never 'prod' — matches every generator's schema
  // default and avoids an accidental production hit if env is ever unset.
  process.env.ADSP_ENV = env || process.env.ADSP_ENV || 'test';

  const fetchToken = async (): Promise<string | undefined> => {
    const result = await getAccessToken(scopes.length ? { scopes } : undefined);
    return result.status === 'ok' ? result.token : undefined;
  };

  let token = await fetchToken();
  if (token) return token;

  if (isNonInteractive()) {
    const loginCmd = [
      'npx @abgov/adsp-cli login',
      `--env ${env}`,
      tenant ? `--tenant "${tenant}"` : realm ? `--realm ${realm}` : '',
      ...scopes.map((s) => `--scope ${s}`),
    ]
      .filter(Boolean)
      .join(' ');
    throw new Error(
      `Not signed in to ADSP (non-interactive run). Sign in first with:\n  ${loginCmd}`
    );
  }

  runAdspLogin({ env, realm, tenant, scopes });
  token = await fetchToken();
  if (token) return token;

  // The requested scope wasn't granted (e.g. non-admin user). Fall back to a
  // base-scope token so the rest of generation still works.
  if (scopes.length) {
    const base = await getAccessToken();
    if (base.status === 'ok') return base.token;
  }
  return undefined;
}

export async function getServiceUrls(directoryUrl: string) {
  const { data: entries } = await axios.get<{ urn: string; url: string }[]>(
    new URL('/directory/v2/namespaces/platform/entries', directoryUrl).href,
    { decompress: true, responseEncoding: 'utf8', responseType: 'json' }
  );

  const urls: Record<string, string> = entries.reduce(
    (values, item) => ({ ...values, [item.urn]: item.url }),
    {}
  );

  return urls;
}

export async function getAdspConfiguration(
  _host: Tree,
  options: { env: EnvironmentName; accessToken?: string; tenant?: string; tenantRealm?: string }
): Promise<AdspConfiguration> {
  const { env, accessToken } = options;
  const environment = environments[env || 'test'];

  if (isAdspOptions(options)) {
    // Adsp configuration already resolved — return it directly.
    return options.adsp;
  }

  if (options.tenant) {
    // --tenant <name>: resolve the realm anonymously (no token needed), then get
    // a token for that realm via the CLI. The token works for ADSP configuration
    // access, the agent-service (agent-user role), and — with the admin scope —
    // Keycloak client provisioning.
    const urls = await getServiceUrls(environment.directoryServiceUrl);
    const tenantServiceUrl = urls['urn:ads:platform:tenant-service:v2'];
    const { data } = await axios.get<{ results: { name: string; realm: string }[] }>(
      new URL('v2/tenants', tenantServiceUrl).href,
      { params: { name: options.tenant } }
    );
    const found = data.results[0];
    if (!found) {
      throw new Error(`Tenant '${options.tenant}' not found.`);
    }

    const realm = options.tenantRealm ?? found.realm;
    const token =
      accessToken ??
      (await ensureAdspToken({ env, realm, tenant: options.tenant, scopes: [ADSP_ADMIN_SCOPE] }));
    return {
      tenant: names(found.name).fileName,
      tenantRealm: realm,
      accessServiceUrl: environment.accessServiceUrl,
      directoryServiceUrl: environment.directoryServiceUrl,
      accessToken: token,
    };
  }

  // No tenant given: let the CLI resolve the tenant (its no-args login lists
  // tenants and prompts), then read the resolved realm + tenant name back from
  // its persisted context via getStatus() — no token-passing, no config-file
  // spelunking.
  const token = accessToken ?? (await ensureAdspToken({ env, scopes: [ADSP_ADMIN_SCOPE] }));
  const status = getStatus();
  if (!status.realm) {
    throw new Error(
      'Could not determine the ADSP tenant. Run `npx @abgov/adsp-cli login` and retry.'
    );
  }
  return {
    tenant: names(status.tenantName ?? status.realm).fileName,
    tenantRealm: status.realm,
    accessServiceUrl: environment.accessServiceUrl,
    directoryServiceUrl: environment.directoryServiceUrl,
    accessToken: token,
  };
}

export function isAdspOptions(options: unknown): options is AdspOptions {
  return !!(options as AdspOptions)?.adsp?.tenantRealm;
}

/**
 * Registers redirect URIs (and matching post-logout URIs) on an existing public
 * client so a deployed app can complete browser sign-in/out against its route.
 *
 * Idempotent and best-effort: no-ops without a token, skips if the client isn't
 * found, and logs (never throws) on failure so it can't break generation. The
 * client's `webOrigins` is intentionally left as-is — the default `["+"]`
 * already allows CORS from any redirect-URI origin.
 */
export async function addClientRedirectUris(
  accessServiceUrl: string,
  realm: string,
  clientId: string,
  redirectUris: string[],
  accessToken: string | undefined
): Promise<void> {
  if (!accessToken || redirectUris.length === 0) return;

  const base = new URL(`/auth/admin/realms/${realm}/clients`, accessServiceUrl)
    .href;
  const authHeader = { Authorization: `Bearer ${accessToken}` };
  const union = (existing: string[] | undefined, additions: string[]) =>
    Array.from(new Set([...(existing ?? []), ...additions]));

  try {
    const { data: clients } = await axios.get(base, {
      params: { clientId },
      headers: authHeader,
    });
    const client = clients?.[0];
    if (!client) {
      console.log(
        `[nx-oc] Public client '${clientId}' not found in realm '${realm}' — skipping redirect URI update.`
      );
      return;
    }

    const existingPostLogout: string[] = (
      client.attributes?.['post.logout.redirect.uris'] ?? ''
    )
      .split('##')
      .filter(Boolean);

    const nextRedirects = union(client.redirectUris, redirectUris);
    const nextPostLogout = union(existingPostLogout, redirectUris).join('##');

    if (
      nextRedirects.length === (client.redirectUris?.length ?? 0) &&
      nextPostLogout === (client.attributes?.['post.logout.redirect.uris'] ?? '')
    ) {
      console.log(
        `[nx-oc] Client '${clientId}' already allows ${redirectUris.join(', ')}.`
      );
      return;
    }

    await axios.put(
      `${base}/${client.id}`,
      {
        ...client,
        redirectUris: nextRedirects,
        attributes: {
          ...client.attributes,
          'post.logout.redirect.uris': nextPostLogout,
        },
      },
      { headers: authHeader }
    );
    console.log(
      `[nx-oc] Registered redirect URI(s) on client '${clientId}': ${redirectUris.join(
        ', '
      )}`
    );
  } catch (err) {
    const detail =
      (err as { response?: { status?: number }; message?: string })?.response
        ?.status ??
      (err as { message?: string })?.message ??
      err;
    console.log(
      `[nx-oc] Could not update redirect URIs for '${clientId}': ${detail}`
    );
  }
}
