import { names, readJson, Tree } from '@nrwl/devkit';
import axios from 'axios';
import { prompt } from 'enquirer';
import * as express from 'express';
import * as open from 'open';
import { AccessToken, AuthorizationCode } from 'simple-oauth2';
import { AdspConfiguration, AdspOptions } from './adsp';
import { EnvironmentName, environments } from './environments';

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

export async function realmLogin(
  accessServiceUrl: string,
  realm: string
): Promise<string> {
  const client = new AuthorizationCode({
    client: {
      id: 'nx-adsp-cli',
      secret: '',
    },
    auth: {
      tokenHost: accessServiceUrl,
      tokenPath: `/auth/realms/${realm}/protocol/openid-connect/token`,
      authorizePath: `/auth/realms/${realm}/protocol/openid-connect/auth`,
    },
  });

  const redirect_uri = 'http://localhost:3000/callback';
  const authorizationUri = client.authorizeURL({
    redirect_uri,
    scope: 'email',
  });

  const app = express();
  const tokenPromise = new Promise<AccessToken>((resolve, reject) => {
    app.get('/callback', function (req, res) {
      const { code, error } = req.query;

      if (error) {
        res.send('Login failed.');
        reject(new Error(`Error encountered during login. ${error}`));
      } else {
        res.send(
          'Successfully signed in. You can close this browser tab or window.'
        );
        resolve(
          client.getToken({
            code: code as string,
            redirect_uri,
          })
        );
      }
    });
  });

  const server = app.listen(3000);
  open(authorizationUri);
  const { token } = await Promise.race([
    tokenPromise,
    new Promise<AccessToken>((_, reject) =>
      setTimeout(
        () => reject(new Error('Timed out waiting for login.')),
        120000
      )
    ),
  ]).finally(() => server.close());

  return token['access_token'];
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

export async function selectTenant(tenantServiceUrl: string, token: string) {
  const { data: tenants } = await axios.get<{
    results: { name: string; realm: string }[];
  }>(new URL('v2/tenants', tenantServiceUrl).href, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const choices = tenants.results
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b));

  const result = await prompt<{ tenant: string }>({
    type: 'autocomplete',
    name: 'tenant',
    message: 'Which tenant is the application or service for?',
    choices,
  });

  const tenant = tenants.results.find((r) => r.name === result.tenant);
  return tenant;
}

export async function getAdspConfiguration(
  _host: Tree,
  options: { env: EnvironmentName; accessToken?: string }
): Promise<AdspConfiguration> {
  const { env, accessToken } = options;
  const environment = environments[env || 'prod'];

  if (isAdspOptions(options)) {
    // If Adsp configuration is already been resolved, then no need to retrieve gain.
    return options.adsp;
  } else {
    const urls = await getServiceUrls(environment.directoryServiceUrl);

    const token =
      accessToken || (await realmLogin(environment.accessServiceUrl, 'core'));

    const tenantServiceUrl = urls['urn:ads:platform:tenant-service:v2'];
    const tenant = await selectTenant(tenantServiceUrl, token);

    return {
      tenant: names(tenant.name).fileName,
      tenantRealm: tenant.realm,
      accessServiceUrl: environment.accessServiceUrl,
      directoryServiceUrl: environment.directoryServiceUrl,
    };
  }
}

export function isAdspOptions(options: unknown): options is AdspOptions {
  return !!(options as AdspOptions)?.adsp?.tenantRealm;
}
