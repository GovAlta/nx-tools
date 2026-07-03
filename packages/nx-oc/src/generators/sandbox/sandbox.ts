import {
  formatFiles,
  generateFiles,
  names,
  ProjectConfiguration,
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
import { DatabaseType } from '../deployment/schema';
import { NormalizedSchema, Schema } from './schema';

const SANDBOX_GENERATOR = '@abgov/nx-oc:sandbox';
const DATABASE_TAG_PREFIX = 'adsp:database:';

// Infer the database when --database wasn't passed, so a DB-backed service isn't
// silently deployed without its DATABASE_URL/migrate wiring. Prefer the explicit
// tag the express-service generator records; fall back to a drizzle db:migrate
// target (postgres) for projects generated before the tag existed.
function detectDatabase(config: ProjectConfiguration): DatabaseType | undefined {
  const tag = (config.tags ?? []).find((t) => t.startsWith(DATABASE_TAG_PREFIX));
  if (tag) return tag.slice(DATABASE_TAG_PREFIX.length) as DatabaseType;
  if (config.targets?.['db:migrate']) return 'postgres';
  return undefined;
}

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
    database: options.database ?? detectDatabase(config) ?? 'none',
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

// Emit the per-app deploy + troubleshooting runbook next to the manifests, so a
// coding agent has one canonical, app-aware source (rather than the guidance
// being duplicated across every app's AGENTS.md).
function addSandboxDoc(host: Tree, options: NormalizedSchema) {
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    `./.openshift/${options.projectName}`,
    {
      projectName: options.projectName,
      appType: options.appType,
      database: options.database ?? 'none',
      sandboxProject: options.sandboxProject,
      registry: options.registry,
      registryHost: options.registryHost,
      imageName: options.imageName,
      tmpl: '',
    }
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
    registry,
    registryOrg,
    imageName,
  } = options;

  // The deploy orchestration (preflight, build → podman → push → import with
  // retry → rollout, database/paired-service provisioning) lives in the
  // @abgov/nx-oc:sandbox executor, versioned in the plugin — so bug fixes reach
  // every project on `npm update` instead of being baked into project.json.
  config.targets = {
    ...config.targets,
    sandbox: {
      executor: '@abgov/nx-oc:sandbox',
      options: {
        sandboxProject,
        registry,
        appType,
        ...(database && database !== 'none' ? { database } : {}),
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
  addSandboxDoc(host, normalizedOptions);
  addSandboxTarget(host, normalizedOptions);
  await registerSandboxRedirectUri(normalizedOptions);
  await formatFiles(host);
}
