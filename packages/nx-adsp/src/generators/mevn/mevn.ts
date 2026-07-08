import { formatFiles, getWorkspaceLayout, installPackagesTask, names, Tree } from '@nx/devkit';
import { getAdspConfiguration } from '@abgov/nx-oc';
import initExpressService from '../express-service/express-service';
import initVueApp from '../vue-app/vue-app';
import { Schema, NormalizedSchema } from './schema';
import { confirmAfterAgentInterrupt, consultAgent } from '../../utils/agent';
import { ensureAudienceMapper, ensureClientRoleScope } from '../../utils/keycloak-admin';
import { PLUGIN_VERSION } from '../../utils/plugin-version';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const adsp = await getAdspConfiguration(host, options);
  return { ...options, accessToken: adsp.accessToken ?? options.accessToken, adsp };
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = await normalizeOptions(host, options);
  const projectName = names(options.name).fileName;
  const serviceName = `${projectName}-service`;
  const appName = `${projectName}-app`;
  const appsDir = getWorkspaceLayout(host).appsDir;
  const serviceRoot = `${appsDir}/${serviceName}`;
  const appRoot = `${appsDir}/${appName}`;

  await initExpressService(host, { ...normalizedOptions, name: serviceName, skipAgent: true, database: 'mongo' });
  await initVueApp(host, {
    ...normalizedOptions,
    name: appName,
    proxy: {
      location: '/api/',
      proxyPass: `http://${serviceName}:3333/${serviceName}/`,
    },
    skipAgent: true,
  });

  if (normalizedOptions.adsp) {
    const accessToken = normalizedOptions.adsp.accessToken ?? normalizedOptions.accessToken;
    const serviceClientId = `urn:ads:${normalizedOptions.adsp.tenant}:${serviceName}`;
    const appClientId = `urn:ads:${normalizedOptions.adsp.tenant}:${appName}`;
    await ensureAudienceMapper(
      normalizedOptions.adsp.accessServiceUrl,
      normalizedOptions.adsp.tenantRealm,
      appClientId,
      serviceClientId,
      accessToken
    );
    await ensureClientRoleScope(
      normalizedOptions.adsp.accessServiceUrl,
      normalizedOptions.adsp.tenantRealm,
      appClientId,
      serviceClientId,
      'example-role',
      accessToken
    );
  }

  if (normalizedOptions.adsp && !normalizedOptions.skipAgent) {
    // getAdspConfiguration now returns a tenant-realm token (via @abgov/adsp-cli)
    // in every path, so no separate agent-token login is needed.
    const accessToken = normalizedOptions.adsp.accessToken;
    await confirmAfterAgentInterrupt(await consultAgent(
      normalizedOptions.adsp.directoryServiceUrl,
      accessToken,
      {
        projectName,
        projectType: 'mevn',
        tenant: normalizedOptions.adsp.tenant,
        pluginVersion: PLUGIN_VERSION,
        existingFiles: {
          'service/src/main.ts': host.read(`${serviceRoot}/src/main.ts`)?.toString() ?? '',
          'service/src/environment.ts': host.read(`${serviceRoot}/src/environment.ts`)?.toString() ?? '',
          'service/src/database.ts': host.read(`${serviceRoot}/src/database.ts`)?.toString() ?? '',
          'service/src/events.ts': host.read(`${serviceRoot}/src/events.ts`)?.toString() ?? '',
          'app/src/App.vue': host.read(`${appRoot}/src/App.vue`)?.toString() ?? '',
          'app/src/main.ts': host.read(`${appRoot}/src/main.ts`)?.toString() ?? '',
          'app/src/router/index.ts': host.read(`${appRoot}/src/router/index.ts`)?.toString() ?? '',
          'app/src/environments/environment.ts': host.read(`${appRoot}/src/environments/environment.ts`)?.toString() ?? '',
        },
      },
      host,
      serviceRoot,
      { additionalRoots: { 'app': appRoot } }
    ));
  }

  await formatFiles(host);

  return () => {
    installPackagesTask(host);
  };
}
