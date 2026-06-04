import { deploymentGenerator, getAdspConfiguration } from '@abgov/nx-oc';
import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  Tree,
} from '@nx/devkit';
import { Linter } from '@nx/eslint';
import * as path from 'path';
import { consultAgent } from '../../utils/agent';
import { Schema, NormalizedSchema } from './schema';

// Version of nx-adsp passed to the agent for template compatibility checks.
// Keep in sync with package.json version.
const PLUGIN_VERSION = '12.x';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const projectName = names(options.name).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;

  const adsp = await getAdspConfiguration(host, options);

  return {
    ...options,
    projectName,
    projectRoot,
    adsp,
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = await normalizeOptions(host, options);

  const { applicationGenerator: initExpress } = await import('@nx/express');
  await initExpress(host, {
    ...options,
    skipFormat: true,
    skipPackageJson: false,
    linter: Linter.EsLint,
    unitTestRunner: 'jest',
    js: false,
    directory: `apps/${options.name}`,
  });

  addDependenciesToPackageJson(
    host,
    {
      '@abgov/adsp-service-sdk': '^2.5.0',
      compression: '^1.8.1',
      cors: '^2.8.5',
      dotenv: '^16.4.7',
      envalid: '^8.0.0',
      helmet: '^8.0.0',
      passport: '^0.7.0',
      'passport-anonymous': '^1.0.1',
    },
    {
      '@types/compression': '^1.7.5',
      '@types/cors': '^2.8.17',
      '@types/passport': '^1.0.16',
      '@types/passport-anonymous': '^1.0.3',
    }
  );

  addFiles(host, normalizedOptions);
  await formatFiles(host);

  // Consult the nx-adsp-agent to augment the project with ADSP capabilities.
  // The agent has access to template tools and a workspace; it generates new
  // files and modifications to integration files (main.ts, environment.ts)
  // which are applied directly to the Nx Tree.
  // Falls back silently if agent-service is unreachable or no accessToken.
  if (normalizedOptions.adsp) {
    const mainTs = host.read(`${normalizedOptions.projectRoot}/src/main.ts`)?.toString() ?? '';
    const environmentTs = host.read(`${normalizedOptions.projectRoot}/src/environment.ts`)?.toString() ?? '';

    await consultAgent(
      normalizedOptions.adsp.directoryServiceUrl,
      options.accessToken,
      {
        projectName: normalizedOptions.projectName,
        projectType: 'express-service',
        tenant: normalizedOptions.adsp.tenant,
        pluginVersion: PLUGIN_VERSION,
        existingFiles: {
          'src/main.ts': mainTs,
          'src/environment.ts': environmentTs,
        },
      },
      host,
      normalizedOptions.projectRoot
    );
  }

  await deploymentGenerator(host, {
    ...normalizedOptions,
    appType: 'node',
    project: normalizedOptions.projectName,
  });

  return () => {
    installPackagesTask(host);
  };
}
