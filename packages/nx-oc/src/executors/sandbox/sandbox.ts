import { ExecutorContext, logger } from '@nx/devkit';
import {
  getAccessToken,
  getDirectoryServiceUrl,
  registerDirectoryService,
} from '@abgov/adsp-cli';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { detectApplicationType } from '../../utils/app-type';
import { activeAccountScopes } from '../../utils/gh-utils';
import { ensureOcLogin } from '../../utils/oc-utils';
import { detectAdspTenant } from '../../adsp/adsp-utils';
import { SandboxExecutorSchema } from './schema';

const PROXY_TAG_PREFIX = 'adsp:proxy-service:';

// Resolves the container build file before the build runs, so a missing or
// misnamed file fails here rather than several minutes in as a podman error.
//
// `--dockerfile` exists because the path is a convention, not a law: the
// OpenShift container-contract preflight and the Government Developer Station
// both look for a repository-root Dockerfile, so a project satisfying that
// contract could not otherwise use this executor at all.
//
// Containerfile is checked as a fallback, not preferred: podman treats the two
// names as equivalent, and the sandbox generator emits `Dockerfile`.
function resolveContainerfile(
  cwd: string,
  projectName: string,
  override?: string,
): string {
  if (override) {
    if (!existsSync(join(cwd, override))) {
      throw new Error(
        `--dockerfile was set to '${override}' but no such file exists relative to the workspace root.`,
      );
    }
    return override;
  }

  const candidates = [
    `.openshift/${projectName}/Dockerfile`,
    `.openshift/${projectName}/Containerfile`,
  ];
  const found = candidates.find((candidate) =>
    existsSync(join(cwd, candidate)),
  );
  if (!found) {
    throw new Error(
      `No container build file found. Looked for:\n` +
        candidates.map((candidate) => `  ${candidate}`).join('\n') +
        `\nRun \`nx g @abgov/nx-oc:sandbox ${projectName}\` to generate one, ` +
        `or pass --dockerfile=<path> if it lives elsewhere (e.g. a root Dockerfile).`,
    );
  }
  return found;
}

// Fail fast, with an actionable message, before the (slow) production build —
// rather than a raw "command not found" partway through.
function requireTool(tool: string, hint: string): void {
  try {
    execSync(`command -v ${tool}`, { stdio: 'ignore', shell: '/bin/bash' });
  } catch {
    throw new Error(`'${tool}' is required but was not found on PATH. ${hint}`);
  }
}

// write:packages is mandatory — the push + pull-secret steps below can't work
// at all without it. delete:packages is only needed by the (best-effort,
// `|| true`'d) GHCR package deletion in the sandbox-teardown target this
// generator also wires up — that call already tolerates failing silently, so
// its absence is worth a warning here rather than a hard failure now.
const REQUIRED_GH_SCOPE = 'write:packages';
const RECOMMENDED_GH_SCOPE = 'delete:packages';

// The pull secret + registry login read the gh session token, so gh must be
// installed, authenticated, AND the *active* account's token must actually
// carry write:packages — `gh auth status` succeeding only confirms *an*
// account is logged in, not that it has the scope the push/pull-secret steps
// below need, so that's checked explicitly too, up front, before the slow
// build rather than at the push/import step where the failure is a bare
// registry auth error with no mention of scope at all.
function requireGhAuth(): void {
  requireTool('gh', 'Install the GitHub CLI (https://cli.github.com).');

  let status: string;
  try {
    status = execSync('gh auth status 2>&1', {
      shell: '/bin/bash',
    }).toString();
  } catch {
    throw new Error(
      'gh is installed but not authenticated. Run `gh auth login` as an account with write:packages on the registry org (check/switch with `gh auth status` / `gh auth switch`).',
    );
  }

  const scopes = activeAccountScopes(status);
  if (!scopes) return;

  if (!scopes.includes(REQUIRED_GH_SCOPE)) {
    throw new Error(
      `The active gh account is missing the '${REQUIRED_GH_SCOPE}' scope needed to push the image and create the pull secret. ` +
        `Run \`gh auth refresh -h github.com -s ${REQUIRED_GH_SCOPE}\` to add it to the current login, or \`gh auth switch\` first ` +
        `if a different, already-scoped account should be active.`,
    );
  }
  if (!scopes.includes(RECOMMENDED_GH_SCOPE)) {
    logger.warn(
      `[nx-oc] The active gh account is missing the '${RECOMMENDED_GH_SCOPE}' scope. Deploying will still work, but ` +
        `\`sandbox-teardown\`'s GHCR package deletion is best-effort and will silently no-op without it, leaving the ` +
        `image behind. Run \`gh auth refresh -h github.com -s ${RECOMMENDED_GH_SCOPE}\` to add it now.`,
    );
  }
}

// podman must be installed and its machine reachable. `podman info` fails when
// the machine is stopped, so it catches that before the build.
function requirePodman(): void {
  requireTool('podman', "Install it (macOS: 'brew install podman').");
  try {
    execSync('podman info', { stdio: 'ignore', shell: '/bin/bash' });
  } catch {
    throw new Error(
      "podman is installed but not responding — start the machine (macOS: 'podman machine start').",
    );
  }
}

function run(label: string, cmd: string, cwd: string): void {
  logger.info(`\n▸ ${label}`);
  // Safe to echo: secrets are shell substitutions ($(gh auth token), $(grep …
  // .env)), so the literal command never contains a resolved secret.
  logger.info(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd, shell: '/bin/bash' });
}

// Run a command and capture stdout; returns '' on any failure.
function capture(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      shell: '/bin/bash',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// oc tag triggers an async imagestream reconcile, so a back-to-back
// import-image can 409 ("object has been modified"). Retry until it settles.
function importWithRetry(
  imageStreamTag: string,
  namespace: string,
  cwd: string,
  retries: number,
): void {
  for (let attempt = 1; ; attempt++) {
    try {
      run(
        `Import image (attempt ${attempt}/${retries})`,
        `oc import-image ${imageStreamTag} --confirm -n ${namespace}`,
        cwd,
      );
      return;
    } catch (err) {
      if (attempt >= retries) {
        throw new Error(
          `oc import-image failed after ${retries} attempts: ${
            (err as Error).message
          }`,
        );
      }
      logger.warn(
        `  import-image failed (likely the oc tag reconcile race); retrying in 3s`,
      );
      execSync('sleep 3', { stdio: 'ignore' });
    }
  }
}

export default async function runExecutor(
  options: SandboxExecutorSchema,
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  const projectName = context.projectName;
  const project =
    projectName && context.projectsConfigurations?.projects[projectName];
  if (!projectName || !project) {
    logger.error('[nx-oc:sandbox] Could not resolve the target project.');
    return { success: false };
  }

  const {
    sandboxProject,
    registry,
    imageTag = 'sandbox',
    skipBuild = false,
    skipPush = false,
    deployBackend = false,
    importRetries = 5,
    registerDirectory = false,
  } = options;

  if (!sandboxProject) {
    logger.error('[nx-oc:sandbox] "sandboxProject" is required.');
    return { success: false };
  }
  if (!registry) {
    logger.error('[nx-oc:sandbox] "registry" is required.');
    return { success: false };
  }

  const appType = options.appType ?? detectApplicationType(project);
  if (!appType) {
    logger.error(
      `[nx-oc:sandbox] Could not determine the application type for ${projectName}.`,
    );
    return { success: false };
  }
  const database = options.database ?? 'none';

  // Container registries (GHCR) require lowercase paths. Prefix the image with
  // the (per-user) namespace so images from different experimenters never
  // collide on GHCR's org-global package names.
  const reg = registry.toLowerCase();
  const registryHost = reg.split('/')[0];
  const imageName = `${sandboxProject}-${projectName}`.toLowerCase();
  const imageRef = `${reg}/${imageName}:${imageTag}`;
  const projectRoot = project.root;
  const cwd = context.root;

  try {
    // ---- preflight: check prerequisites before the expensive build ----
    ensureOcLogin();
    // The pull secret + import always need gh (session token to reach GHCR).
    requireGhAuth();
    if (!skipBuild || !skipPush) {
      requirePodman();
    }
    // Resolved in the preflight, not at the build step: an unbuildable path
    // should stop the run before it provisions secrets and a database.
    const containerfile = skipBuild
      ? undefined
      : resolveContainerfile(cwd, projectName, options.dockerfile);

    // ---- service client secret (node services authenticate to ADSP) ----
    // Upserted from the current .env.local so re-runs pick up a rotated secret.
    // CLIENT_SECRET lives in .env.local, not .env (@abgov/nx-adsp's
    // express-service writes it there — it's a generated, local-only value,
    // the same tier `nx dev-db` uses for DATABASE_URL/MONGODB_URI).
    if (appType === 'node') {
      run(
        'Upsert CLIENT_SECRET',
        `_cs=$(grep -E '^CLIENT_SECRET=' ${projectRoot}/.env.local 2>/dev/null | cut -d= -f2-); ` +
          `if [ -n "$_cs" ]; then ` +
          `oc create secret generic ${projectName}-secrets ` +
          `--from-literal=CLIENT_SECRET="$_cs" ` +
          `-n ${sandboxProject} --dry-run=client -o yaml | oc apply -f -; fi`,
        cwd,
      );
    }

    // ---- shared database provisioning ----
    if (database === 'postgres') {
      // oc get crd is cluster-scoped and returns Forbidden for namespace-admin
      // users. oc api-resources hits the API discovery endpoint which is
      // accessible regardless of namespace scope.
      const cnpgAvailable = !!capture(
        `oc api-resources --api-group=postgresql.cnpg.io 2>/dev/null | grep -q '^clusters' && echo ok`,
        cwd,
      );
      // Check for a pre-existing CNPG Cluster regardless of CRD availability —
      // if one was ever provisioned here we must never fall back to the plain
      // Deployment, which would create a second postgres alongside it.
      const cnpgClusterExists = !!capture(
        `oc get clusters.postgresql.cnpg.io sandbox-postgres -n ${sandboxProject} 2>/dev/null`,
        cwd,
      );

      if (cnpgAvailable) {
        // Quota check only matters when provisioning a new cluster — on re-runs
        // the PVC already exists and is counted in `used`, so used === hard would
        // be a false positive (finding 4).
        if (!cnpgClusterExists) {
          const quotaLine = capture(
            `oc describe resourcequota -n ${sandboxProject} 2>/dev/null | grep 'azure-disk'`,
            cwd,
          );
          if (quotaLine) {
            const parts = quotaLine.trim().split(/\s+/);
            const used = parts[parts.length - 2];
            const hard = parts[parts.length - 1];
            if (hard && used && hard === used) {
              throw new Error(
                `azure-disk storage quota is full in namespace ${sandboxProject} (${used}/${hard}). ` +
                  `Free capacity before provisioning the CNPG Cluster: ` +
                  `\`oc get pvc -n ${sandboxProject}\` to see claims and delete orphaned ones.`,
              );
            }
          }
        }
        // restricted-v2 SCC must be granted to the sandbox-postgres SA before the
        // Cluster manifest is applied (findings 1 & 3): the controller only
        // schedules the first pod if the SA already has the SCC at first reconcile.
        // Create the SA first so the grant can run (the operator would otherwise
        // create it implicitly on first apply, too late for the SCC to take effect).
        run(
          'Ensure sandbox-postgres SA',
          `oc get sa sandbox-postgres -n ${sandboxProject} 2>/dev/null || ` +
            `oc create sa sandbox-postgres -n ${sandboxProject}`,
          cwd,
        );
        // Try to grant the SCC — succeeds for users with cluster-admin rights (local
        // dev). In CI the github-actions SA lacks `adm policy` permission; warn
        // and continue. If the SCC was not pre-provisioned by a cluster admin,
        // `oc wait` below will surface the failure. See SANDBOX.md Prerequisites
        // for the one-time command a cluster admin must run before first CI deploy.
        try {
          run(
            'Grant restricted-v2 SCC to CNPG Cluster SA',
            `oc adm policy add-scc-to-user restricted-v2 -z sandbox-postgres -n ${sandboxProject}`,
            cwd,
          );
        } catch {
          logger.warn(
            '  Could not grant restricted-v2 SCC to sandbox-postgres SA — ' +
              'ensure a cluster admin has run this once; see SANDBOX.md Prerequisites.',
          );
        }
        run(
          'Apply CNPG Cluster',
          `oc apply -f .openshift/sandbox/sandbox-postgres-cnpg.yml -n ${sandboxProject}`,
          cwd,
        );
        // Use clusters.postgresql.cnpg.io — `oc get cluster` on OpenShift
        // resolves to clusters.aro.openshift.io and returns Forbidden (finding 6).
        run(
          'Wait for CNPG Cluster ready',
          `oc wait clusters.postgresql.cnpg.io/sandbox-postgres --for=condition=Ready --timeout=300s -n ${sandboxProject}`,
          cwd,
        );
        run(
          'Apply per-app Database CR',
          `oc apply -f .openshift/sandbox/${projectName}-db.yml -n ${sandboxProject}`,
          cwd,
        );
      } else if (cnpgClusterExists) {
        // Operator CRD gone but a Cluster CR still exists — operator may be
        // temporarily down or uninstalled after provisioning. Falling back to
        // the plain Deployment would create a second postgres alongside the
        // existing CNPG Cluster and corrupt the namespace state.
        throw new Error(
          `CNPG Cluster 'sandbox-postgres' already exists in ${sandboxProject} but the ` +
            `clusters.postgresql.cnpg.io CRD is not responding. ` +
            `The operator may be temporarily unavailable — check its status before re-deploying. ` +
            `Do not fall back to the plain Deployment while a CNPG Cluster is present.`,
        );
      } else {
        // Safe to use the plain Deployment — no CNPG Cluster has ever been
        // provisioned in this namespace.
        logger.warn(
          `\n[nx-oc] CloudNativePG operator not found in cluster (no clusters.postgresql.cnpg.io CRD). ` +
            `Falling back to plain Postgres Deployment.`,
        );
        run(
          'Ensure Postgres credentials',
          `oc get secret sandbox-postgres-creds -n ${sandboxProject} 2>/dev/null || ` +
            `oc create secret generic sandbox-postgres-creds ` +
            `--from-literal=POSTGRESQL_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=') ` +
            `-n ${sandboxProject}`,
          cwd,
        );
        run(
          'Deploy shared Postgres',
          `oc apply -f .openshift/sandbox/sandbox-postgres.yml -n ${sandboxProject}`,
          cwd,
        );
        const dbName = `${projectName}_sandbox`;
        run(
          'Create app database',
          `oc rollout status deployment/sandbox-postgres -n ${sandboxProject} --timeout=180s && ` +
            `oc exec -n ${sandboxProject} deployment/sandbox-postgres -- ` +
            `bash -lc "psql -U postgres -tc \\"SELECT 1 FROM pg_database WHERE datname='${dbName}'\\" ` +
            `| grep -q 1 || createdb -U postgres ${dbName}"`,
          cwd,
        );
        // Compatibility shims: create resources in the same shape as the CNPG
        // operator so the app manifest (sandbox-postgres-app + sandbox-postgres-rw)
        // resolves correctly whether CNPG or the plain Deployment is running.
        run(
          'Ensure sandbox-postgres-app secret',
          `oc create secret generic sandbox-postgres-app ` +
            `--from-literal=username=postgres ` +
            `--from-literal=password="$(oc get secret sandbox-postgres-creds ` +
            `-n ${sandboxProject} -o go-template='{{.data.POSTGRESQL_ADMIN_PASSWORD | base64decode}}')" ` +
            `-n ${sandboxProject} --dry-run=client -o yaml | oc apply -f -`,
          cwd,
        );
        run(
          'Ensure sandbox-postgres-rw Service alias',
          `oc get service sandbox-postgres-rw -n ${sandboxProject} 2>/dev/null || ` +
            `oc create service clusterip sandbox-postgres-rw --tcp=5432:5432 -n ${sandboxProject}`,
          cwd,
        );
        run(
          'Point sandbox-postgres-rw at plain Deployment pods',
          `oc patch service sandbox-postgres-rw -n ${sandboxProject} ` +
            `--type=merge -p '{"spec":{"selector":{"app":"sandbox-postgres"}}}'`,
          cwd,
        );
      }
    } else if (database === 'mongo') {
      run(
        'Ensure MongoDB credentials',
        `oc get secret sandbox-mongodb-creds -n ${sandboxProject} 2>/dev/null || ` +
          `oc create secret generic sandbox-mongodb-creds ` +
          `--from-literal=MONGODB_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=') ` +
          `-n ${sandboxProject}`,
        cwd,
      );
      run(
        'Deploy shared MongoDB',
        `oc apply -f .openshift/sandbox/sandbox-mongodb.yml -n ${sandboxProject}`,
        cwd,
      );
    }

    // ---- paired backend Services (so a frontend's nginx resolves proxy_pass
    // upstreams at startup). Only the Service is needed for DNS. Idempotent. ----
    const proxyServices = (project.tags ?? [])
      .filter((tag) => tag.startsWith(PROXY_TAG_PREFIX))
      .map((tag) => {
        const value = tag.slice(PROXY_TAG_PREFIX.length);
        const lastColon = value.lastIndexOf(':');
        return {
          name: value.slice(0, lastColon),
          port: value.slice(lastColon + 1),
        };
      });
    for (const { name, port } of proxyServices) {
      // Use oc apply (idempotent) with selector: name: <name> — the same selector the
      // backend's own manifest uses. oc create service clusterip writes selector: app: <name>
      // and oc apply's three-way merge never removes it (it was never in last-applied-
      // configuration), leaving both keys and no matching endpoints. app: <name> is kept in
      // metadata.labels so the teardown target's -l app=<name>,deployment-mode=sandbox
      // can clean up the stub if the backend is never deployed.
      run(
        `Ensure paired Service ${name}`,
        `cat <<'EOF' | oc apply -f - -n ${sandboxProject}
apiVersion: v1
kind: Service
metadata:
  name: ${name}
  labels:
    app: ${name}
    deployment-mode: sandbox
spec:
  selector:
    name: ${name}
  ports:
  - port: ${port}
    targetPort: ${port}
EOF`,
        cwd,
      );
    }

    // The Service stub above only stops nginx crashlooping; the backend needs
    // its own pods for /api proxying to work. Deploy it (opt-in) or warn that
    // proxied calls will 502 until it is deployed separately.
    for (const { name } of proxyServices) {
      if (deployBackend) {
        try {
          run(
            `Deploy paired backend ${name}`,
            `npx nx run ${name}:sandbox`,
            cwd,
          );
        } catch {
          throw new Error(
            `--deployBackend: could not deploy paired backend "${name}". Ensure it has a sandbox target ` +
              `(nx g @abgov/nx-oc:sandbox ${name} --sandboxProject ${sandboxProject}).`,
          );
        }
      } else {
        const endpoints = capture(
          `oc get endpoints ${name} -n ${sandboxProject} -o jsonpath='{.subsets[*].addresses[*].ip}'`,
          cwd,
        );
        if (!endpoints) {
          logger.warn(
            `\n⚠ Paired backend "${name}" has no running pods in ${sandboxProject}. ` +
              `The frontend will deploy, but requests proxied to ${name} will 502 until it is deployed:\n` +
              `    nx run ${name}:sandbox\n` +
              `  (or re-run this target with --deployBackend to deploy it first).`,
          );
        }
      }
    }

    // ---- build locally + push to the registry ----
    if (!skipBuild) {
      run(
        'Build',
        `npx nx build ${projectName} --configuration production`,
        cwd,
      );
      run(
        'Podman build',
        `podman build --platform=linux/amd64 -f ${containerfile} -t ${imageRef} .`,
        cwd,
      );
    }
    if (!skipPush) {
      // gh supplies the token so no PAT is stored; the same session token backs
      // the pull secret below. GITHUB_ACTOR (always set by the Actions runner)
      // takes priority over `gh api user -q .login`: GET /user categorically
      // 403s for a GitHub App/installation token (GITHUB_TOKEN), regardless of
      // its granted permissions — confirmed against a real CI run — so a
      // workflow with `packages: write` still needs this fallback to publish
      // under its own GITHUB_TOKEN with no PAT. Local/interactive use (no
      // GITHUB_ACTOR set) is unaffected — still resolves the active gh account.
      run(
        'Registry login',
        `gh auth token | podman login ${registryHost} -u "\${GITHUB_ACTOR:-$(gh api user -q .login)}" --password-stdin`,
        cwd,
      );
      run('Push image', `podman push ${imageRef}`, cwd);
    }

    // ---- import into the namespace imagestream + roll out ----
    // Per-deploy pull secret from the gh session (no long-lived PAT needed).
    // Same GITHUB_ACTOR fallback as the registry login above, same reason.
    run(
      'Upsert pull secret',
      `oc create secret docker-registry ghcr-pull ` +
        `--docker-server=${registryHost} --docker-username="\${GITHUB_ACTOR:-$(gh api user -q .login)}" --docker-password="$(gh auth token)" ` +
        `-n ${sandboxProject} --dry-run=client -o yaml | oc apply -f -`,
      cwd,
    );
    // oc tag sets/repoints the imagestream tag with reference-policy=local so
    // pods pull in-cluster; import --confirm then pulls the current manifest.
    run(
      'Tag imagestream',
      `oc tag ${imageRef} ${projectName}:${imageTag} --reference-policy=local -n ${sandboxProject}`,
      cwd,
    );
    importWithRetry(
      `${projectName}:${imageTag}`,
      sandboxProject,
      cwd,
      importRetries,
    );

    run(
      'Apply manifest',
      `oc process -f .openshift/${projectName}/${projectName}.sandbox.yml -p PROJECT=${sandboxProject} | oc apply -f -`,
      cwd,
    );
    run(
      'Restart rollout',
      `oc rollout restart deployment/${projectName} -n ${sandboxProject}`,
      cwd,
    );
    run(
      'Wait for rollout',
      `oc rollout status deployment/${projectName} -n ${sandboxProject} --timeout=180s`,
      cwd,
    );

    // ---- ADSP directory registration (opt-in, non-fatal) ----
    if (registerDirectory && appType !== 'frontend') {
      const routeHost = capture(
        `oc get route ${projectName} -n ${sandboxProject} -o jsonpath='{.spec.host}'`,
        cwd,
      );
      if (!routeHost) {
        logger.warn(
          `[nx-oc:sandbox] Could not resolve route for ${projectName} — skipping directory registration.`,
        );
      } else {
        const serviceUrl = `https://${routeHost}`;
        const tenantName = detectAdspTenant(project.tags ?? []);
        if (!tenantName) {
          logger.warn(
            `[nx-oc:sandbox] No ADSP tenant tag found on ${projectName} — skipping directory registration. ` +
              `Scaffold with nx-adsp or add the tag manually.`,
          );
        } else {
          const namespace = tenantName.toLowerCase().replace(/ /g, '-');
          const tokenResult = await getAccessToken();
          if (tokenResult.status !== 'ok') {
            logger.warn(
              `[nx-oc:sandbox] Not authenticated to ADSP — skipping directory registration. ` +
                `Run \`adsp login --tenant "${tenantName}"\` first.`,
            );
          } else {
            try {
              const directoryServiceUrl = getDirectoryServiceUrl();
              const outcome = await registerDirectoryService(
                directoryServiceUrl,
                namespace,
                projectName,
                serviceUrl,
                tokenResult.token,
              );
              if (outcome === 'registered') {
                logger.info(
                  `\n✓ Registered urn:ads:${namespace}:${projectName} → ${serviceUrl}`,
                );
              } else {
                logger.info(
                  `  Directory entry urn:ads:${namespace}:${projectName} already exists, skipping.`,
                );
              }
            } catch (err) {
              logger.warn(
                `[nx-oc:sandbox] Directory registration skipped: ${(err as Error).message}`,
              );
            }
            // Advisory: warn if the app doesn't serve the HAL root docs link
            // that the api-docs aggregator needs to discover the OpenAPI spec.
            const rootJson = capture(
              `curl -sf --connect-timeout 5 --max-time 10 ${serviceUrl}/ 2>/dev/null`,
              cwd,
            );
            if (rootJson && !rootJson.includes('"docs"')) {
              logger.warn(
                `[nx-oc:sandbox] ${projectName} does not expose _links.docs.href at GET /. ` +
                  `The ADSP api-docs aggregator won't be able to find its OpenAPI spec.`,
              );
            }
          }
        }
      }
    }

    logger.info(`\n✓ Sandbox deploy complete for ${projectName}.`);
    return { success: true };
  } catch (err) {
    logger.error(`\n[nx-oc:sandbox] ${(err as Error).message}`);
    return { success: false };
  }
}
