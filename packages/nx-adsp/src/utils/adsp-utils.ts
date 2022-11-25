import { readJson, Tree } from '@nrwl/devkit';
import axios from 'axios';
import * as express from 'express';
import * as open from 'open';
import { AccessToken, AuthorizationCode } from 'simple-oauth2';
import { AdspConfiguration } from './adsp';
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

  return !!dependencies[dependency] || !!devDependencies[dependency];
}

async function tenantLogin(
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
    scope: 'profile email',
  });

  const app = express();
  const tokenPromise = new Promise<AccessToken>((resolve) => {
    app.get('/callback', function (req, res) {
      res.send('Successfully signed in. You can close the browser.');

      resolve(
        client.getToken({
          code: req.query.code as string,
          redirect_uri,
        })
      );
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

  return token.access_token;
}

export async function getAdspConfiguration(
  _host: Tree,
  { env, realm }: { env?: EnvironmentName; realm: string },
  login = false
): Promise<AdspConfiguration> {
  let tenant = '';
  const environment = environments[env || 'prod'];

  if (login) {
    const { data: entries } = await axios.get<{ urn: string; url: string }[]>(
      new URL(
        '/directory/v2/namespaces/platform/entries',
        environment.directoryServiceUrl
      ).href,
      { decompress: true, responseEncoding: 'utf8', responseType: 'json' }
    );

    const urls = entries.reduce(
      (values, item) => ({ ...values, [item.urn]: item.url }),
      {}
    );
    
    const token = await tenantLogin(environment.accessServiceUrl, realm);

    const tenantServiceUrl = urls['urn:ads:platform:tenant-service:v2'];
    const { data: tenants } = await axios.get<{ results: { name: string }[] }>(
      new URL('v2/tenants', tenantServiceUrl).href,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    tenant = tenants.results[0].name;
  }

  return {
    tenant,
    tenantRealm: realm,
    accessServiceUrl: environment.accessServiceUrl,
    directoryServiceUrl: environment.directoryServiceUrl,
  };
}
