import { installPackagesTask, Tree } from '@nrwl/devkit';
import initDotnetService from '../dotnet-service/dotnet-service';
import initReactApp from '../react-app/react-app';
import { Schema } from './schema';

export default async function (host: Tree, options: Schema) {
  await initDotnetService(host, {
    ...options,
    name: `${options.name}-service`,
  });

  await initReactApp(host, {
    ...options,
    name: `${options.name}-app`,
    proxy: {
      location: '/api/',
      proxyPass: `http://${options.name}-service:5000/${options.name}-service/`,
    },
  });

  return () => {
    installPackagesTask(host);
  };
}
