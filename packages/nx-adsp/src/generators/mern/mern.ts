import { formatFiles, getWorkspaceLayout, installPackagesTask, names, Tree } from '@nx/devkit';
import { getAdspConfiguration } from '@abgov/nx-oc';
import initExpressService from '../express-service/express-service';
import initReactApp from '../react-app/react-app';
import { Schema, NormalizedSchema } from './schema';
import { confirmAfterAgentInterrupt, consultAgent } from '../../utils/agent';
import { PLUGIN_VERSION } from '../../utils/plugin-version';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const adsp = await getAdspConfiguration(host, options);
  // Propagate the token from adsp to the Schema-level accessToken so that
  // sub-generators (express-service, react-app) that check options.accessToken
  // see it and skip their own realmLogin fallback.
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

  // Scaffold both projects before the agent interaction so files exist to upload.
  await initExpressService(host, { ...normalizedOptions, name: serviceName, skipAgent: true });
  await initReactApp(host, {
    ...normalizedOptions,
    name: appName,
    proxy: {
      location: '/api/',
      proxyPass: `http://${serviceName}:3333/${serviceName}/`,
    },
    skipAgent: true,
  });

  if (normalizedOptions.adsp && options.tenant) {
    // Single conversation covering the full stack. Files from both projects are
    // uploaded with service/ and app/ prefixes so the agent can write to both,
    // and are routed to the correct project root when applied.
    await confirmAfterAgentInterrupt(await consultAgent(
      normalizedOptions.adsp.directoryServiceUrl,
      normalizedOptions.adsp.accessToken,
      {
        projectName,
        projectType: 'mern',
        tenant: normalizedOptions.adsp.tenant,
        pluginVersion: PLUGIN_VERSION,
        existingFiles: {
          'service/src/main.ts': host.read(`${serviceRoot}/src/main.ts`)?.toString() ?? '',
          'service/src/environment.ts': host.read(`${serviceRoot}/src/environment.ts`)?.toString() ?? '',
          'app/src/app/app.tsx': host.read(`${appRoot}/src/app/app.tsx`)?.toString() ?? '',
          'app/src/store.ts': host.read(`${appRoot}/src/store.ts`)?.toString() ?? '',
          'app/src/environments/environment.ts': host.read(`${appRoot}/src/environments/environment.ts`)?.toString() ?? '',
          'app/src/app/config.slice.ts': host.read(`${appRoot}/src/app/config.slice.ts`)?.toString() ?? '',
          'app/src/app/intake.slice.ts': host.read(`${appRoot}/src/app/intake.slice.ts`)?.toString() ?? '',
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
