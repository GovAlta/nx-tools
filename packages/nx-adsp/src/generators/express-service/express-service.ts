import { deploymentGenerator, environments, getAdspConfiguration, getServiceUrls, realmLogin } from '@abgov/nx-oc';
import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nx/devkit';
import { Linter } from '@nx/eslint';
import * as path from 'path';
import { consultAgent } from '../../utils/agent';
import { ensureServiceClient } from '../../utils/keycloak-admin';
import { PLUGIN_VERSION } from '../../utils/plugin-version';
import { addEslintQualityRules, addJestCoverageConfig, addSemgrepTarget, addVsCodeSettings } from '../../utils/quality';
import { Schema, NormalizedSchema } from './schema';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const projectName = names(options.name).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;

  let adsp: import('@abgov/nx-oc').AdspConfiguration;

  if (options.tenant) {
    // Resolve realm from tenant name via the public tenant service API (no auth required),
    // then do a single browser login for the tenant realm.
    const env = environments[options.env ?? 'prod'];
    const tenantServiceUrl = (await getServiceUrls(env.directoryServiceUrl))['urn:ads:platform:tenant-service'];

    const { default: axios } = await import('axios');
    const { data } = await axios.get<{ results: { name: string; realm: string }[] }>(
      new URL('/api/tenant/v2/tenants', tenantServiceUrl).href,
      { params: { name: options.tenant } }
    );

    const tenantInfo = data?.results?.[0];
    if (!tenantInfo) {
      throw new Error(`Tenant "${options.tenant}" not found in ${env.directoryServiceUrl}.`);
    }

    const tenantRealm = options.tenantRealm ?? tenantInfo.realm;

    if (!options.accessToken) {
      options = {
        ...options,
        accessToken: await realmLogin(env.accessServiceUrl, tenantRealm).catch(() => undefined),
      };
    }

    adsp = {
      tenant: tenantInfo.name,
      tenantRealm,
      accessServiceUrl: env.accessServiceUrl,
      directoryServiceUrl: env.directoryServiceUrl,
    };
  } else {
    adsp = await getAdspConfiguration(host, options);
  }

  return {
    ...options,
    projectName,
    projectRoot,
    adsp,
    database: options.database ?? 'none',
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    pairedProject: options.pairedProject ?? null,
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
  if (options.database === 'postgres' || options.database === 'mongo') {
    generateFiles(
      host,
      path.join(__dirname, `files-${options.database}`),
      options.projectRoot,
      templateOptions
    );
  }
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = await normalizeOptions(host, options);

  const { applicationGenerator: initExpress } = await import('@nx/express').catch(
    () => {
      throw new Error(
        "The 'express-service' generator requires the '@nx/express' plugin. Install it and re-run:\n  npm i -D @nx/express"
      );
    }
  );
  await initExpress(host, {
    ...options,
    skipFormat: true,
    skipPackageJson: false,
    linter: Linter.EsLint,
    unitTestRunner: 'jest',
    js: false,
    directory: normalizedOptions.projectRoot,
  });

  addDependenciesToPackageJson(
    host,
    {
      '@abgov/adsp-service-sdk': '^2.23.0',
      compression: '^1.8.1',
      cors: '^2.8.5',
      dotenv: '^16.4.7',
      envalid: '^8.0.0',
      helmet: '^8.0.0',
      passport: '^0.7.0',
      'passport-anonymous': '^1.0.1',
      zod: '^3.0.0',
      ...(normalizedOptions.database === 'postgres' ? { 'drizzle-orm': '^0.44.0', pg: '^8.11.0' } : {}),
      ...(normalizedOptions.database === 'mongo' ? { mongoose: '^8.0.0' } : {}),
    },
    {
      '@types/compression': '^1.7.5',
      '@types/cors': '^2.8.17',
      '@types/passport': '^1.0.16',
      '@types/passport-anonymous': '^1.0.3',
      ...(normalizedOptions.database === 'postgres' ? { 'drizzle-kit': '^0.31.0', '@types/pg': '^8.11.0' } : {}),
      'eslint-plugin-security': '^3.0.0',
      'eslint-plugin-no-secrets': '^2.0.0',
      'eslint-plugin-jest': '^28.0.0',
    }
  );

  addFiles(host, normalizedOptions);

  addEslintQualityRules(host, normalizedOptions.projectRoot, ['**/*.spec.ts', '**/*.test.ts']);
  addJestCoverageConfig(host, normalizedOptions.projectRoot);
  addVsCodeSettings(host);

  const projectConfig = readProjectConfiguration(host, normalizedOptions.projectName);
  const targets = { ...projectConfig.targets };

  if (normalizedOptions.database !== 'none') {

    targets['dev-db'] = {
      executor: 'nx:run-commands',
      options: {
        command: 'bash scripts/dev-db.sh',
        cwd: '{projectRoot}',
      },
    };

    if (targets['serve']) {
      targets['serve'] = {
        ...targets['serve'],
        dependsOn: [...(targets['serve'].dependsOn ?? []), 'dev-db'],
      };
    }

    if (normalizedOptions.database === 'postgres') {
      targets['db:generate'] = {
        executor: 'nx:run-commands',
        options: { command: 'npx drizzle-kit generate', cwd: '{projectRoot}' },
      };
      targets['db:migrate'] = {
        executor: 'nx:run-commands',
        options: { command: 'npx drizzle-kit migrate', cwd: '{projectRoot}' },
      };
      targets['db:migrate:deploy'] = {
        executor: 'nx:run-commands',
        options: { command: 'npx drizzle-kit migrate', cwd: '{projectRoot}' },
      };
      targets['db:studio'] = {
        executor: 'nx:run-commands',
        options: { command: 'npx drizzle-kit studio', cwd: '{projectRoot}' },
      };

      // Ship the SQL migrations (drizzle/) into the build output so the migrate.js
      // init container can apply them at deploy time. Drizzle is pure TypeScript
      // with no client codegen, so the build has no db:generate prerequisite.
      if (targets['build']?.options) {
        targets['build'] = {
          ...targets['build'],
          options: {
            ...targets['build'].options,
            assets: [
              ...(targets['build'].options.assets ?? []),
              {
                input: `${normalizedOptions.projectRoot}/drizzle`,
                glob: '**/*',
                output: 'drizzle',
              },
            ],
          },
        };
      }
    }

  }

  // Record the database as a project tag so the nx-oc sandbox generator can
  // wire DATABASE_URL + the migrate init container without a --database flag.
  const dbTag = `adsp:database:${normalizedOptions.database}`;
  const tags =
    normalizedOptions.database !== 'none' &&
    !(projectConfig.tags ?? []).includes(dbTag)
      ? [...(projectConfig.tags ?? []), dbTag]
      : projectConfig.tags;

  updateProjectConfiguration(host, normalizedOptions.projectName, {
    ...projectConfig,
    targets,
    tags,
  });

  addSemgrepTarget(host, normalizedOptions.projectName);
  await formatFiles(host);

  if (normalizedOptions.adsp) {
    const clientId = `urn:ads:${normalizedOptions.adsp.tenant}:${normalizedOptions.projectName}`;
    const accessToken = normalizedOptions.accessToken ?? normalizedOptions.adsp.accessToken;
    const clientSecret = await ensureServiceClient(
      normalizedOptions.adsp.accessServiceUrl,
      normalizedOptions.adsp.tenantRealm,
      clientId,
      accessToken
    );
    if (clientSecret) {
      const envPath = `${normalizedOptions.projectRoot}/.env`;
      const existing = host.exists(envPath) ? host.read(envPath).toString() : '';
      if (!existing.includes('CLIENT_SECRET=')) {
        host.write(envPath, `${existing ? existing.trimEnd() + '\n' : ''}CLIENT_SECRET=${clientSecret}\n`);
      }
      const gitignorePath = '.gitignore';
      if (host.exists(gitignorePath)) {
        const gitignoreContent = host.read(gitignorePath).toString();
        if (!gitignoreContent.includes('.env')) {
          host.write(gitignorePath, `${gitignoreContent.trimEnd()}\n${normalizedOptions.projectRoot}/.env\n`);
        }
      }
    }
  }

  // Consult the nx-adsp-agent to augment the project with ADSP capabilities.
  // The agent has access to template tools and a workspace; it generates new
  // files and modifications to integration files (main.ts, environment.ts)
  // which are applied directly to the Nx Tree.
  // Falls back silently if agent-service is unreachable or no accessToken.
  if (normalizedOptions.adsp && !options.skipAgent) {
    // When --tenant was provided, normalizedOptions.accessToken holds the token
    // from the single realm login already performed during normalizeOptions.
    // token from the single realm login. Fall back to a new login only when the
    // full interactive flow was used and no token is available.
    const accessToken =
      normalizedOptions.accessToken ??
      (await realmLogin(
        normalizedOptions.adsp.accessServiceUrl,
        normalizedOptions.adsp.tenantRealm
      ).catch((err) => {
        process.stdout.write(`Agent sign-in failed (${err?.message ?? err}) — skipping agent interaction.\n`);
        return undefined;
      }));

    const mainTs = host.read(`${normalizedOptions.projectRoot}/src/main.ts`)?.toString() ?? '';
    const environmentTs = host.read(`${normalizedOptions.projectRoot}/src/environment.ts`)?.toString() ?? '';
    const eventsTs = host.read(`${normalizedOptions.projectRoot}/src/events.ts`)?.toString() ?? '';
    const databaseTs =
      normalizedOptions.database !== 'none'
        ? host.read(`${normalizedOptions.projectRoot}/src/database.ts`)?.toString() ?? ''
        : undefined;

    const agentResult = await consultAgent(
      normalizedOptions.adsp.directoryServiceUrl,
      accessToken,
      {
        projectName: normalizedOptions.projectName,
        projectType: 'express-service',
        tenant: normalizedOptions.adsp.tenant,
        pluginVersion: PLUGIN_VERSION,
        existingFiles: {
          'src/main.ts': mainTs,
          'src/environment.ts': environmentTs,
          'src/events.ts': eventsTs,
          ...(databaseTs ? { 'src/database.ts': databaseTs } : {}),
        },
      },
      host,
      normalizedOptions.projectRoot
    );

    // When the agent interaction ended without generating files — whether the
    // user was in a conversation or Ctrl+C'd before the agent responded —
    // confirm whether to proceed. Default to false when Ctrl+C was used.
    if (agentResult && agentResult.filesWritten === 0) {
      const { prompt } = await import('enquirer');
      const { proceed } = await prompt<{ proceed: boolean }>({
        type: 'confirm',
        name: 'proceed',
        message: 'Agent interaction ended without generating files. Continue with base scaffolding?',
        initial: !agentResult.interrupted,
      });
      if (!proceed) {
        throw new Error('Generation aborted.');
      }
    }
  }

  await deploymentGenerator(host, {
    ...normalizedOptions,
    appType: 'node',
    project: normalizedOptions.projectName,
    database: normalizedOptions.database,
  });

  return () => {
    installPackagesTask(host);
  };
}
