import {
  formatFiles,
  generateFiles,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nx/devkit';
import * as path from 'path';
import { getAdspConfiguration } from '../../adsp';
import { getGitRemoteUrl } from '../../utils/git-utils';
import { ApplicationType } from '../deployment/schema';
import { NormalizedSchema, Schema } from './schema';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const projectName = names(options.project).fileName;

  const config = readProjectConfiguration(host, projectName);
  let appType: ApplicationType = options.appType;
  if (!appType) {
    switch (config.targets.build.executor) {
      case '@nx/web:webpack':
      case '@angular-devkit/build-angular:browser':
        appType = 'frontend';
        break;
      case '@nx/node:build':
        appType = 'node';
        break;
      case '@nx-dotnet/core:build':
        appType = 'dotnet';
        break;
      case '@nx/webpack:webpack':
        appType =
          config.targets.build.options.target === 'node' ? 'node' : 'frontend';
        break;
    }
  }

  const adsp = await getAdspConfiguration(host, {
    ...options,
    env: (options.env as 'dev' | 'test' | 'prod') ?? 'dev',
  });

  return {
    ...options,
    appType,
    adsp,
    projectName,
  };
}

function addManifestFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    sourceRepositoryUrl: getGitRemoteUrl(),
    database: options.database ?? 'none',
    sandbox: true,
    ocInfraProject: options.sandboxProject,
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, `../deployment/${options.appType}-files`),
    `./.openshift/${options.projectName}`,
    templateOptions
  );
}

function addDatabaseFiles(host: Tree, options: NormalizedSchema) {
  if (!options.database || options.database === 'none') return;
  generateFiles(
    host,
    path.join(__dirname, 'database-files'),
    './.openshift/sandbox',
    { database: options.database, tmpl: '' }
  );
}

function addSandboxTarget(host: Tree, options: NormalizedSchema) {
  const config = readProjectConfiguration(host, options.project);
  const { projectName, sandboxProject, database } = options;

  const commands: string[] = [];

  if (database === 'postgres') {
    commands.push(
      `oc get secret sandbox-postgres-creds -n ${sandboxProject} 2>/dev/null || ` +
        `oc create secret generic sandbox-postgres-creds ` +
        `--from-literal=POSTGRESQL_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=') ` +
        `-n ${sandboxProject}`
    );
    commands.push(
      `oc apply -f .openshift/sandbox/sandbox-postgres.yml -n ${sandboxProject}`
    );
  } else if (database === 'mongo') {
    commands.push(
      `oc get secret sandbox-mongodb-creds -n ${sandboxProject} 2>/dev/null || ` +
        `oc create secret generic sandbox-mongodb-creds ` +
        `--from-literal=MONGODB_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=') ` +
        `-n ${sandboxProject}`
    );
    commands.push(
      `oc apply -f .openshift/sandbox/sandbox-mongodb.yml -n ${sandboxProject}`
    );
  }

  commands.push(
    `oc process -f .openshift/${projectName}/${projectName}.yml -p PROJECT=${sandboxProject} | oc apply -f -`
  );

  commands.push(
    [
      `REGISTRY=$(oc registry info)`,
      `CONTAINER_CLI=$(command -v podman || command -v docker)`,
      `$CONTAINER_CLI login -u $(oc whoami) -p $(oc whoami -t) $REGISTRY`,
      `$CONTAINER_CLI build -t $REGISTRY/${sandboxProject}/${projectName}:sandbox -f .openshift/${projectName}/Dockerfile .`,
      `$CONTAINER_CLI push $REGISTRY/${sandboxProject}/${projectName}:sandbox`,
    ].join(' && ')
  );

  commands.push(
    `oc rollout restart deployment/${projectName} -n ${sandboxProject}`
  );
  commands.push(
    `oc rollout status deployment/${projectName} -n ${sandboxProject} --timeout=120s`
  );

  config.targets = {
    ...config.targets,
    sandbox: {
      executor: 'nx:run-commands',
      options: {
        commands,
        sequential: true,
      },
    },
  };

  updateProjectConfiguration(host, options.project, config);
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = await normalizeOptions(host, options);
  if (!normalizedOptions.appType) {
    console.log('Cannot generate sandbox deployment for unknown project type.');
    return;
  }

  addManifestFiles(host, normalizedOptions);
  addDatabaseFiles(host, normalizedOptions);
  addSandboxTarget(host, normalizedOptions);
  await formatFiles(host);
}
