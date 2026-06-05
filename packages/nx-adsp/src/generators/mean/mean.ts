import { formatFiles, getWorkspaceLayout, installPackagesTask, names, Tree } from '@nx/devkit';
import { getAdspConfiguration } from '@abgov/nx-oc';
import initAngularApp from '../angular-app/angular-app';
import initExpressService from '../express-service/express-service';
import { NormalizedSchema, Schema } from './schema';
import { confirmAfterAgentInterrupt, consultAgent } from '../../utils/agent';
import { PLUGIN_VERSION } from '../../utils/plugin-version';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const adsp = await getAdspConfiguration(host, options);
  return { ...options, adsp };
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
  await initAngularApp(host, {
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
        projectType: 'mean',
        tenant: normalizedOptions.adsp.tenant,
        pluginVersion: PLUGIN_VERSION,
        existingFiles: {
          'service/src/main.ts': host.read(`${serviceRoot}/src/main.ts`)?.toString() ?? '',
          'service/src/environment.ts': host.read(`${serviceRoot}/src/environment.ts`)?.toString() ?? '',
          'app/src/app/app.component.ts': host.read(`${appRoot}/src/app/app.component.ts`)?.toString() ?? '',
          'app/src/app/app.component.html': host.read(`${appRoot}/src/app/app.component.html`)?.toString() ?? '',
          'app/src/app/app.config.ts': host.read(`${appRoot}/src/app/app.config.ts`)?.toString() ?? '',
          'app/src/app/app.routes.ts': host.read(`${appRoot}/src/app/app.routes.ts`)?.toString() ?? '',
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
