import {
  formatFiles,
  generateFiles,
  names,
  readNxJson,
  readProjectConfiguration,
  Tree,
  updateNxJson,
  updateProjectConfiguration,
} from '@nx/devkit';
import * as path from 'path';
import { getAdspConfiguration, addClientRedirectUris } from '../../adsp';
import {
  getGitRemoteUrl,
  deriveRegistryFromRemote,
  getGitHubRepo,
} from '../../utils/git-utils';
import { getClusterIngressDomain } from '../../utils/oc-utils';
import { detectApplicationType, getBuildOutputPath } from '../../utils/app-type';
import { NormalizedSchema, Schema } from './schema';

const SANDBOX_GENERATOR = '@abgov/nx-oc:sandbox';

// Resolves the sandbox container registry once per workspace and persists it to
// nx.json so subsequent sandbox generations reuse it without re-prompting:
//   --registry flag → nx.json → derived from git remote (ghcr.io/<org>) → prompt.
async function resolveRegistry(
  host: Tree,
  registry: string | undefined,
  remoteUrl: string | undefined
): Promise<string> {
  if (registry) return persistRegistry(host, registry);

  const stored = (
    readNxJson(host)?.generators as
      | Record<string, { registry?: string }>
      | undefined
  )?.[SANDBOX_GENERATOR]?.registry;
  if (stored) return stored;

  const derived = deriveRegistryFromRemote(remoteUrl);
  if (derived) {
    console.log(`\n✓ Sandbox registry: ${derived.toLowerCase()} (derived from git remote)\n`);
    return persistRegistry(host, derived);
  }

  const { prompt } = await import('enquirer');
  const { registry: answered } = await prompt<{ registry: string }>({
    type: 'input',
    name: 'registry',
    message:
      'What container registry should sandbox images be published to (e.g., ghcr.io/my-org)?',
  });
  return persistRegistry(host, answered);
}

// Container registries (GHCR) require lowercase paths, so normalize on store.
function persistRegistry(host: Tree, registry: string): string {
  const value = registry.toLowerCase();
  const nxJson = readNxJson(host) ?? {};
  const generators = (nxJson.generators ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  generators[SANDBOX_GENERATOR] = {
    ...(generators[SANDBOX_GENERATOR] ?? {}),
    registry: value,
  };
  nxJson.generators = generators;
  updateNxJson(host, nxJson);
  return value;
}

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

  const remoteUrl = getGitRemoteUrl();
  const registry = (await resolveRegistry(host, options.registry, remoteUrl)).toLowerCase();
  // Prefix the image with the (per-user) sandbox namespace so images from
  // different experimenters never collide on GHCR's org-global package names.
  const imageName = `${options.sandboxProject}-${projectName}`.toLowerCase();
  const repoSlug = getGitHubRepo(remoteUrl);

  return {
    ...options,
    appType,
    adsp,
    projectName,
    buildOutputPath: getBuildOutputPath(config),
    registry,
    registryHost: registry.split('/')[0],
    registryOrg: registry.split('/').slice(1).join('/'),
    imageName,
    imageRef: `${registry}/${imageName}:sandbox`,
    sourceRepositoryUrl: repoSlug ? `https://github.com/${repoSlug}` : undefined,
  };
}

function addManifestFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    // Clean https URL for the image's source label (provenance / UI connect).
    sourceRepositoryUrl: options.sourceRepositoryUrl ?? '',
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
  const {
    projectName,
    sandboxProject,
    database,
    appType,
    imageRef,
    registryHost,
    registryOrg,
    imageName,
  } = options;

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

  // Build the image locally and push to the container registry, then import it
  // into the namespace's imagestream. reference-policy=local mirrors it into the
  // internal registry so pods pull in-cluster (no per-pod pull secret, no node
  // egress to the registry). This replaces the in-cluster BuildConfig: no
  // full-workspace upload, and local layer caching makes iteration fast.
  commands.push(`npx nx build ${projectName} --configuration production`);
  commands.push(
    `podman build --platform=linux/amd64 -f .openshift/${projectName}/Dockerfile -t ${imageRef} .`
  );
  // Prereq: the publishing account is logged in with write:packages. gh supplies
  // the token so no PAT is stored; the same session token backs the pull secret.
  commands.push(
    `gh auth token | podman login ${registryHost} -u "$(gh api user -q .login)" --password-stdin`
  );
  commands.push(`podman push ${imageRef}`);
  // Per-deploy pull secret from the gh session (sandbox images are re-imported
  // every run, so a session token is sufficient — no long-lived PAT needed).
  commands.push(
    `oc create secret docker-registry ghcr-pull ` +
      `--docker-server=${registryHost} --docker-username="$(gh api user -q .login)" --docker-password="$(gh auth token)" ` +
      `-n ${sandboxProject} --dry-run=client -o yaml | oc apply -f -`
  );
  // oc tag sets/repoints the imagestream tag (import-image refuses to change an
  // existing tag's source); import --confirm then pulls the manifest.
  commands.push(
    `oc tag ${imageRef} ${projectName}:sandbox --reference-policy=local -n ${sandboxProject}`
  );
  // oc tag triggers an async imagestream reconcile, so a back-to-back
  // import-image can 409 ("object has been modified"). Retry until it settles.
  commands.push(
    `n=0; until oc import-image ${projectName}:sandbox --confirm -n ${sandboxProject}; do ` +
      `n=$((n+1)); [ $n -ge 5 ] && exit 1; sleep 3; done`
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
          `oc delete all,configmap,is -l app=${projectName} -n ${sandboxProject} --ignore-not-found`,
          `oc delete imagestream ${projectName} -n ${sandboxProject} --ignore-not-found`,
          // Remove the sandbox package (needs delete:packages). Best-effort:
          // sandbox packages are the unlinked ones and can also be pruned org-wide
          // via `select(.repository == null)`.
          `gh api --method DELETE /orgs/${registryOrg}/packages/container/${imageName} 2>/dev/null || true`,
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
  addDatabaseFiles(host, normalizedOptions);
  addSandboxTarget(host, normalizedOptions);
  await registerSandboxRedirectUri(normalizedOptions);
  await formatFiles(host);
}
