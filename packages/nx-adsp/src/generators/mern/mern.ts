import { formatFiles, installPackagesTask, names, Tree } from '@nx/devkit';
import { getAdspConfiguration } from '@abgov/nx-oc';
import initExpressService from '../express-service/express-service';
import initReactApp from '../react-app/react-app';
import { Schema, NormalizedSchema } from './schema';

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

  await initExpressService(host, {
    ...normalizedOptions,
    name: `${projectName}-service`,
  });

  await initReactApp(host, {
    ...normalizedOptions,
    name: `${projectName}-app`,
    proxy: {
      location: '/api/',
      proxyPass: `http://${projectName}-service:3333/${projectName}-service/`,
    },
  });

  await formatFiles(host);

  return () => {
    installPackagesTask(host);
  };
}
