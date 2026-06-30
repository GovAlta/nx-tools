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
import { detectApplicationType, getBuildOutputPath } from '../../utils/app-type';
import { NormalizedSchema, Schema } from './schema';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const projectName = names(options.project).fileName;

  const config = readProjectConfiguration(host, projectName);
  const appType = options.appType ?? detectApplicationType(config);

  const adsp = await getAdspConfiguration(host, {
    ...options,
    env: (options.env as 'dev' | 'test' | 'prod') ?? 'dev',
  });

  return {
    ...options,
    appType,
    adsp,
    projectName,
    buildOutputPath: getBuildOutputPath(config),
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

// In-cluster build infrastructure (ImageStream + binary Docker BuildConfig).
// The sandbox builds inside the cluster and pushes to the internal registry,
// so it needs no GitHub repo/CI, no externally-exposed registry route, and no
// local container runtime.
function addBuildFiles(host: Tree, options: NormalizedSchema) {
  generateFiles(host, path.join(__dirname, 'build-files'), './.openshift', {
    projectName: options.projectName,
    tmpl: '',
  });
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

  // Ensure any paired backend Services exist first, so this app's nginx can
  // resolve its proxy_pass upstreams at startup (otherwise the pod crashloops
  // until the Service appears). Create only the Service (all nginx needs for
  // DNS) — not the backend's deployment, which has no image until its own
  // sandbox runs. Idempotent: skipped once the Service exists, so it doesn't
  // slow down repeated frontend iteration. Recorded by the composite generators
  // (pevn/mevn/…) as `adsp:proxy-service:<name>:<port>` project tags.
  const PREFIX = 'adsp:proxy-service:';
  const proxyServices = (config.tags ?? [])
    .filter((tag) => tag.startsWith(PREFIX))
    .map((tag) => {
      const value = tag.slice(PREFIX.length);
      const lastColon = value.lastIndexOf(':');
      return {
        name: value.slice(0, lastColon),
        port: value.slice(lastColon + 1),
      };
    });
  for (const { name, port } of proxyServices) {
    commands.push(
      `oc get service ${name} -n ${sandboxProject} >/dev/null 2>&1 || ` +
        `oc create service clusterip ${name} --tcp=${port}:${port} -n ${sandboxProject}`
    );
  }

  // Ensure the in-cluster build infrastructure (ImageStream + BuildConfig).
  commands.push(
    `oc apply -f .openshift/${projectName}/sandbox-build.yml -n ${sandboxProject}`
  );
  // Build locally, then build the image in-cluster from the uploaded context
  // and push to the internal registry — no external registry route required.
  commands.push(`npx nx build ${projectName} --configuration production`);
  commands.push(
    `oc start-build ${projectName} --from-dir=. --follow --wait -n ${sandboxProject}`
  );

  commands.push(
    `oc process -f .openshift/${projectName}/${projectName}.yml -p PROJECT=${sandboxProject} | oc apply -f -`
  );

  commands.push(
    `oc rollout restart deployment/${projectName} -n ${sandboxProject}`
  );
  commands.push(
    `oc rollout status deployment/${projectName} -n ${sandboxProject} --timeout=180s`
  );

  config.targets = {
    ...config.targets,
    sandbox: {
      executor: 'nx:run-commands',
      options: {
        commands,
        parallel: false,
      },
    },
    'sandbox-teardown': {
      executor: 'nx:run-commands',
      options: {
        commands: [
          `oc delete all,configmap,bc,is -l app=${projectName} -n ${sandboxProject} --ignore-not-found`,
        ],
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
  addBuildFiles(host, normalizedOptions);
  addDatabaseFiles(host, normalizedOptions);
  addSandboxTarget(host, normalizedOptions);
  await formatFiles(host);
}
