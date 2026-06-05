import { formatFiles, getWorkspaceLayout, installPackagesTask, names, Tree } from '@nx/devkit';
import { getAdspConfiguration } from '@abgov/nx-oc';
import initExpressService from '../express-service/express-service';
import { PLUGIN_VERSION } from '../../utils/plugin-version';
import initReactApp from '../react-app/react-app';
import { Schema, NormalizedSchema } from './schema';
import { consultAgent } from '../../utils/agent';

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
  const serviceRoot = `${getWorkspaceLayout(host).appsDir}/${serviceName}`;
  const appRoot = `${getWorkspaceLayout(host).appsDir}/${appName}`;

  // When --tenant is provided, getAdspConfiguration returns a tenant-realm token
  // that works for the agent-service. Use a shared thread so the agent carries
  // context from the service discussion into the frontend interaction.
  const sharedThreadId = options.tenant ? crypto.randomUUID() : undefined;

  await initExpressService(host, {
    ...normalizedOptions,
    name: serviceName,
    skipAgent: !!sharedThreadId,
  });

  if (sharedThreadId && normalizedOptions.adsp) {
    const mainTs = host.read(`${serviceRoot}/src/main.ts`)?.toString() ?? '';
    const environmentTs = host.read(`${serviceRoot}/src/environment.ts`)?.toString() ?? '';
    await consultAgent(
      normalizedOptions.adsp.directoryServiceUrl,
      normalizedOptions.adsp.accessToken,
      {
        projectName: serviceName,
        projectType: 'express-service',
        tenant: normalizedOptions.adsp.tenant,
        pluginVersion: PLUGIN_VERSION,
        existingFiles: {
          'src/main.ts': mainTs,
          'src/environment.ts': environmentTs,
        },
      },
      host,
      serviceRoot,
      { threadId: sharedThreadId }
    );
  }

  await initReactApp(host, {
    ...normalizedOptions,
    name: appName,
    proxy: {
      location: '/api/',
      proxyPass: `http://${serviceName}:3333/${serviceName}/`,
    },
    skipAgent: !!sharedThreadId,
  });

  if (sharedThreadId && normalizedOptions.adsp) {
    const appTs = host.read(`${appRoot}/src/app/app.tsx`)?.toString() ?? '';
    const storeTs = host.read(`${appRoot}/src/store.ts`)?.toString() ?? '';
    const environmentTs = host.read(`${appRoot}/src/environments/environment.ts`)?.toString() ?? '';
    const configSliceTs = host.read(`${appRoot}/src/app/config.slice.ts`)?.toString() ?? '';
    const intakeSliceTs = host.read(`${appRoot}/src/app/intake.slice.ts`)?.toString() ?? '';
    await consultAgent(
      normalizedOptions.adsp.directoryServiceUrl,
      normalizedOptions.adsp.accessToken,
      {
        projectName: appName,
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
      appRoot,
      { threadId: sharedThreadId }
    );
  }

  await formatFiles(host);

  return () => {
    installPackagesTask(host);
  };
}
