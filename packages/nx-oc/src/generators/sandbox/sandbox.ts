import {
  formatFiles,
  generateFiles,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nx/devkit';
import * as path from 'path';
import { getAdspConfiguration, addClientRedirectUris } from '../../adsp';
import { getGitRemoteUrl } from '../../utils/git-utils';
import { getClusterIngressDomain } from '../../utils/oc-utils';
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
  const { projectName, sandboxProject, database, appType } = options;

  const commands: string[] = [];

  // ADSP services authenticate with the access service using a confidential
  // Keycloak client secret. The express-service generator writes it to the
  // service's .env (CLIENT_SECRET=...) at generate time; mirror it into an
  // OpenShift Secret the deployment reads. Upserted from the current .env so
  // re-runs pick up a rotated secret. Non-node app types have no client secret.
  if (appType === 'node') {
    commands.push(
      `oc create secret generic ${projectName}-secrets ` +
        `--from-literal=CLIENT_SECRET="$(grep -E '^CLIENT_SECRET=' ${config.root}/.env 2>/dev/null | cut -d= -f2-)" ` +
        `-n ${sandboxProject} --dry-run=client -o yaml | oc apply -f -`
    );
  }

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
    // The shared Postgres instance only creates the admin database; each app
    // needs its own <app>_sandbox database created before its migrate init
    // container runs (neither the image nor the ORM creates it). Wait for
    // Postgres to be ready, then create the database idempotently.
    const dbName = `${projectName}_sandbox`;
    commands.push(
      `oc rollout status deployment/sandbox-postgres -n ${sandboxProject} --timeout=180s && ` +
        `oc exec -n ${sandboxProject} deployment/sandbox-postgres -- ` +
        `bash -lc "psql -U postgres -tc \\"SELECT 1 FROM pg_database WHERE datname='${dbName}'\\" ` +
        `| grep -q 1 || createdb -U postgres ${dbName}"`
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

// Register the sandbox deployment's Route with the frontend's public client so
// browser sign-in works against the deployed URL — not just localhost. The
// Route host is deterministic by convention (<app>-<namespace>.<ingressDomain>),
// so this happens once at generate time using the token already obtained for
// ADSP config — no per-deploy login.
async function registerSandboxRedirectUri(options: NormalizedSchema) {
  if (options.appType !== 'frontend') return;
  const { adsp, projectName, sandboxProject } = options;
  if (!adsp?.accessToken) return;

  const ingressDomain = getClusterIngressDomain();
  if (!ingressDomain) {
    console.log(
      '[nx-oc] Could not determine the cluster ingress domain; skipping redirect URI registration. ' +
        'Add the deployment Route to the client manually if browser sign-in fails.'
    );
    return;
  }

  const routeUrl = `https://${projectName}-${sandboxProject}.${ingressDomain}`;
  const clientId = `urn:ads:${adsp.tenant}:${projectName}`;
  await addClientRedirectUris(
    adsp.accessServiceUrl,
    adsp.tenantRealm,
    clientId,
    [`${routeUrl}/*`],
    adsp.accessToken
  );
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
  await registerSandboxRedirectUri(normalizedOptions);
  await formatFiles(host);
}
