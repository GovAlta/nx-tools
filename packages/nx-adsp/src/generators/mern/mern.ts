import { formatFiles, getWorkspaceLayout, installPackagesTask, names, Tree } from '@nx/devkit';
import { getAdspConfiguration } from '@abgov/nx-oc';
import initExpressService, { PLUGIN_VERSION } from '../express-service/express-service';
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
  const serviceRoot = `${getWorkspaceLayout(host).appsDir}/${serviceName}`;

  // Scaffold the service first so the agent can read the generated files.
  await initExpressService(host, {
    ...normalizedOptions,
    name: serviceName,
    skipAgent: true,
  });

  // Agent interaction runs once for the composite — after service scaffold,
  // before frontend scaffold, so any generated files are applied before the
  // rest of the project is written.
  if (normalizedOptions.adsp) {
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
      serviceRoot
    );
  }

  await initReactApp(host, {
    ...normalizedOptions,
    name: `${projectName}-app`,
    proxy: {
      location: '/api/',
      proxyPass: `http://${serviceName}:3333/${serviceName}/`,
    },
  });

  await formatFiles(host);

  return () => {
    installPackagesTask(host);
  };
}
