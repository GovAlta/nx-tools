import { getProjects, ProjectConfiguration, Tree } from '@nx/devkit';
import { Schema } from './schema';

// Best-effort, non-interactive provisioning of agent-delivery-iteration.yml's own GitHub repo
// secrets/variables -- see the approved plan (packages/nx-agent's PR history) for the full design.
// Every live call here degrades to an `undetermined` item with an actionable reason rather than
// throwing; the one hard invariant is that an item already sitting on the repo is never touched
// unless --overwriteExisting is passed, regardless of why this run would otherwise set it.

type Resolution =
  | { source: 'explicit' | 'derived' | 'constant'; value: string }
  | { source: 'undetermined'; reason: string };

type Item = { name: string; kind: 'secret' | 'variable' } & Resolution;

function explicitOr(
  explicit: string | undefined,
  derive: () => Resolution,
): Resolution {
  return explicit !== undefined ? { source: 'explicit', value: explicit } : derive();
}

// Two independent things a project can carry, written by different generators at different
// times (nx-oc:sandbox vs. any nx-adsp app/service generator) -- resolving them as one combined
// lookup would wrongly suppress a value that's genuinely already derivable (e.g. ADSP_ENV from a
// scaffolded app) just because a different, unrelated one (OPENSHIFT_NAMESPACE from `sandbox`,
// which may not have run yet) isn't ready. See the plan's "Sequencing" section.
function getProjectConfigs(
  host: Tree,
  projectFilter: string | undefined,
): { configs: [string, ProjectConfiguration][]; error?: string } {
  if (projectFilter === undefined) {
    return { configs: [...getProjects(host)] };
  }
  const config = [...getProjects(host)].find(([name]) => name === projectFilter);
  return config
    ? { configs: [config] }
    : { configs: [], error: `project '${projectFilter}' not found in this workspace` };
}

function resolveConsistentValue(
  candidates: { name: string; value: string | undefined }[],
  notFoundReason: string,
): Resolution {
  const found = candidates.filter(
    (c): c is { name: string; value: string } => c.value !== undefined,
  );
  if (found.length === 0) {
    return { source: 'undetermined', reason: notFoundReason };
  }
  const distinct = [...new Set(found.map((f) => f.value))];
  if (distinct.length === 1) {
    return { source: 'derived', value: distinct[0] };
  }
  const detail = distinct
    .map(
      (v) =>
        `${v} (${found
          .filter((f) => f.value === v)
          .map((f) => f.name)
          .join(', ')})`,
    )
    .join('; ');
  return {
    source: 'undetermined',
    reason: `ambiguous across projects -- ${detail} -- pass --project to pick one`,
  };
}

export async function provisionGithubActionsSecrets(
  host: Tree,
  options: Schema,
): Promise<void> {
  if (!options.provisionSecrets) return;
  if (!options.githubActions) {
    console.log(
      '[nx-agent] --provisionSecrets has no effect without --githubActions -- nothing to provision a workflow for. Skipping.',
    );
    return;
  }

  const nxOc = await import('@abgov/nx-oc').catch(() => {
    throw new Error(
      "The 'agent-delivery' generator's --provisionSecrets option requires '@abgov/nx-oc'. Install it and re-run:\n  npm i -D @abgov/nx-oc",
    );
  });

  const items: Item[] = [];
  const push = (name: string, kind: Item['kind'], resolution: Resolution) =>
    items.push({ name, kind, ...resolution });

  // --- project-derived values: namespace and tags are scanned independently (see above) ---
  const { configs, error: projectError } = getProjectConfigs(host, options.project);

  const namespace = explicitOr(options.openshiftNamespace, () =>
    projectError
      ? { source: 'undetermined', reason: projectError }
      : resolveConsistentValue(
          configs.map(([name, config]) => ({
            name,
            value: (
              config.targets?.['sandbox']?.options as
                | { sandboxProject?: string }
                | undefined
            )?.sandboxProject,
          })),
          "no project has run nx-oc:sandbox yet -- run it first, or pass --openshiftNamespace",
        ),
  );
  push('OPENSHIFT_NAMESPACE', 'variable', namespace);

  const env = explicitOr(options.adspEnv, () =>
    projectError
      ? { source: 'undetermined', reason: projectError }
      : resolveConsistentValue(
          configs.map(([name, config]) => ({
            name,
            value: nxOc.detectAdspEnv(config.tags),
          })),
          'no project carries an adsp:scaffold-env: tag yet -- scaffold an app/service first, or pass --adspEnv',
        ),
  );
  push('ADSP_ENV', 'variable', env);

  const tenantName = explicitOr(options.adspTenantName, () =>
    projectError
      ? { source: 'undetermined', reason: projectError }
      : resolveConsistentValue(
          configs.map(([name, config]) => ({
            name,
            value: nxOc.detectAdspTenant(config.tags),
          })),
          'no project carries an adsp:scaffold-tenant: tag yet -- scaffold an app/service first, or pass --adspTenantName',
        ),
  );
  push('ADSP_TENANT_NAME', 'variable', tenantName);

  // --- OpenShift server/token: independent of project state, dependent on local oc login ---
  const wantsOcDerivation = !options.openshiftServer || !options.openshiftToken;
  let ocReady = false;
  if (wantsOcDerivation) {
    ocReady = nxOc.isOcLoggedIn();
    if (!ocReady && !nxOc.isNonInteractive()) {
      try {
        nxOc.ensureOcLogin();
        ocReady = nxOc.isOcLoggedIn();
      } catch {
        ocReady = false;
      }
    }
  }

  const notLoggedInReason = (name: string) =>
    `not logged in to OpenShift and this run can't prompt interactively -- run \`oc login --web\` first, or pass --${name}`;

  push(
    'OPENSHIFT_SERVER',
    'secret',
    explicitOr(options.openshiftServer, () => {
      if (!ocReady) return { source: 'undetermined', reason: notLoggedInReason('openshiftServer') };
      const server = nxOc.getOcServerUrl();
      return server
        ? { source: 'derived', value: server }
        : {
            source: 'undetermined',
            reason: 'oc is logged in but reported no server URL -- check `oc config view`',
          };
    }),
  );

  push(
    'OPENSHIFT_TOKEN',
    'secret',
    explicitOr(options.openshiftToken, () => {
      if (!ocReady) return { source: 'undetermined', reason: notLoggedInReason('openshiftToken') };
      if (namespace.source === 'undetermined') {
        return { source: 'undetermined', reason: 'OPENSHIFT_NAMESPACE is undetermined -- see above' };
      }
      const saToken = nxOc.getSaToken('github-actions', namespace.value);
      return saToken
        ? { source: 'derived', value: saToken }
        : {
            source: 'undetermined',
            reason: `could not get a token for the 'github-actions' service account in namespace '${namespace.value}' -- has it been provisioned? see nx-oc:setup-secrets`,
          };
    }),
  );

  // --- ADSP tenant realm + client secret: live ADSP/Keycloak calls, one admin token feeds both ---
  let adspAdmin: { accessServiceUrl: string; realm: string; accessToken: string } | undefined;

  const needsAdspAdminToken = !options.adspTenantRealm || !options.adspClientSecret;
  if (needsAdspAdminToken && env.source !== 'undetermined') {
    try {
      const adsp = await nxOc.getAdspConfiguration(host, {
        env: env.value as 'dev' | 'test' | 'prod',
        tenant: tenantName.source !== 'undetermined' ? tenantName.value : undefined,
        tenantRealm: options.adspTenantRealm,
        accessToken: options.accessToken,
      });
      if (adsp.accessToken) {
        adspAdmin = {
          accessServiceUrl: adsp.accessServiceUrl,
          realm: adsp.tenantRealm,
          accessToken: adsp.accessToken,
        };
      }
      if (!options.adspTenantRealm) {
        push('ADSP_TENANT_REALM', 'variable', { source: 'derived', value: adsp.tenantRealm });
      }
    } catch (err) {
      if (!options.adspTenantRealm) {
        push('ADSP_TENANT_REALM', 'variable', {
          source: 'undetermined',
          reason: (err as Error)?.message ?? String(err),
        });
      }
    }
  } else if (!options.adspTenantRealm) {
    push('ADSP_TENANT_REALM', 'variable', {
      source: 'undetermined',
      reason: 'ADSP_ENV is undetermined -- see above',
    });
  }
  if (options.adspTenantRealm) {
    push('ADSP_TENANT_REALM', 'variable', { source: 'explicit', value: options.adspTenantRealm });
  }

  push(
    'ADSP_CLIENT_SECRET',
    'secret',
    await (async (): Promise<Resolution> => {
      if (options.adspClientSecret) {
        return { source: 'explicit', value: options.adspClientSecret };
      }
      if (!adspAdmin) {
        return {
          source: 'undetermined',
          reason: 'no ADSP admin-scoped token available -- see ADSP_TENANT_REALM above',
        };
      }
      try {
        const status = await nxOc.getAdspCliCiStatus(
          adspAdmin.accessServiceUrl,
          adspAdmin.realm,
          adspAdmin.accessToken,
        );
        if (!status.found) {
          return {
            source: 'undetermined',
            reason: `the tenant's adsp-cli-ci Keycloak client was not found in realm '${adspAdmin.realm}' -- this shouldn't happen for a normal ADSP tenant; check with a tenant admin`,
          };
        }
        if (!status.enabled) {
          return {
            source: 'undetermined',
            reason:
              `the tenant's adsp-cli-ci Keycloak client is disabled -- log in to the Keycloak admin console for realm '${adspAdmin.realm}' -> Clients -> adsp-cli-ci -> Settings -> enable it -> Credentials tab -> copy or regenerate the secret -> re-run with --adspClientSecret <secret>, or set it directly with \`gh secret set ADSP_CLIENT_SECRET\`.`,
          };
        }
        return { source: 'derived', value: status.secret as string };
      } catch (err) {
        return { source: 'undetermined', reason: (err as Error)?.message ?? String(err) };
      }
    })(),
  );

  // ADSP_CLIENT_ID has no override option -- it's always this fixed constant, per @abgov/adsp-cli's
  // own README ("the client ID is always adsp-cli-ci").
  push('ADSP_CLIENT_ID', 'secret', { source: 'constant', value: 'adsp-cli-ci' });

  if (options.maxIterations !== undefined) {
    push('MAX_ITERATIONS', 'variable', { source: 'explicit', value: String(options.maxIterations) });
  }

  // --- Phase 2: write, never overwriting an existing value unless explicitly told to ---
  console.log('\n[nx-agent] --provisionSecrets results:');

  const remoteUrl = nxOc.getGitRemoteUrl();
  const repo = remoteUrl ? nxOc.getGitHubRepo(remoteUrl) : undefined;
  let canWrite = false;
  let existingSecrets = new Set<string>();
  let existingVariables = new Set<string>();

  if (!repo) {
    console.log(
      '  ⚠  no GitHub remote found -- cannot write any secret/variable (values below are still reported).',
    );
  } else {
    try {
      nxOc.checkGhCli('repo');
      existingSecrets = new Set(nxOc.listGhSecretNames(repo));
      existingVariables = new Set(nxOc.listGhVariableNames(repo));
      canWrite = true;
    } catch (err) {
      console.log(
        `  ⚠  ${(err as Error)?.message ?? err} -- cannot write any secret/variable (values below are still reported).`,
      );
    }
  }

  for (const item of items) {
    if (item.source === 'undetermined') {
      console.log(`  ⚠  ${item.name}: ${item.reason}`);
      continue;
    }
    if (!canWrite) {
      console.log(`  •  ${item.name}: determined (not written -- see above)`);
      continue;
    }
    const existingNames = item.kind === 'secret' ? existingSecrets : existingVariables;
    if (existingNames.has(item.name) && !options.overwriteExisting) {
      console.log(
        `  •  ${item.name} already set on the repo -- left unchanged (pass --overwriteExisting to replace it)`,
      );
      continue;
    }
    const ok =
      item.kind === 'secret'
        ? nxOc.setGhSecret(item.name, item.value, repo as string)
        : nxOc.setGhVariable(item.name, item.value, repo as string);
    console.log(ok ? `  ✓  ${item.name} set` : `  ✗  failed to set ${item.name}`);
  }

  console.log(
    '  ⚠  org-level Copilot CLI billing policy must still be enabled by hand (GitHub org admin console) -- ' +
      'no repo secret/variable covers this, and its absence only surfaces later as a workflow permission failure.',
  );
}
