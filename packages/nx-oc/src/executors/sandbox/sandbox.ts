import { ExecutorContext, logger } from '@nx/devkit';
import { execSync } from 'child_process';
import { detectApplicationType } from '../../utils/app-type';
import { ensureOcLogin } from '../../utils/oc-utils';
import { SandboxExecutorSchema } from './schema';

const PROXY_TAG_PREFIX = 'adsp:proxy-service:';

// Fail fast, with an actionable message, before the (slow) production build —
// rather than a raw "command not found" partway through.
function requireTool(tool: string, hint: string): void {
  try {
    execSync(`command -v ${tool}`, { stdio: 'ignore', shell: '/bin/bash' });
  } catch {
    throw new Error(
      `'${tool}' is required but was not found on PATH. ${hint}`
    );
  }
}

// The pull secret + registry login read the gh session token, so gh must be
// installed AND authenticated. Checked up front so a missing/expired login
// fails before the slow build rather than at the push/import step.
function requireGhAuth(): void {
  requireTool('gh', 'Install the GitHub CLI (https://cli.github.com).');
  try {
    execSync('gh auth status', { stdio: 'ignore', shell: '/bin/bash' });
  } catch {
    throw new Error(
      'gh is installed but not authenticated. Run `gh auth login` as an account with write:packages on the registry org (check/switch with `gh auth status` / `gh auth switch`).'
    );
  }
}

// podman must be installed and its machine reachable. `podman info` fails when
// the machine is stopped, so it catches that before the build.
function requirePodman(): void {
  requireTool(
    'podman',
    "Install it (macOS: 'brew install podman')."
  );
  try {
    execSync('podman info', { stdio: 'ignore', shell: '/bin/bash' });
  } catch {
    throw new Error(
      "podman is installed but not responding — start the machine (macOS: 'podman machine start')."
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
    return execSync(cmd, { cwd, shell: '/bin/bash', stdio: ['ignore', 'pipe', 'ignore'] })
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
  retries: number
): void {
  for (let attempt = 1; ; attempt++) {
    try {
      run(
        `Import image (attempt ${attempt}/${retries})`,
        `oc import-image ${imageStreamTag} --confirm -n ${namespace}`,
        cwd
      );
      return;
    } catch (err) {
      if (attempt >= retries) {
        throw new Error(
          `oc import-image failed after ${retries} attempts: ${
            (err as Error).message
          }`
        );
      }
      logger.warn(
        `  import-image failed (likely the oc tag reconcile race); retrying in 3s`
      );
      execSync('sleep 3', { stdio: 'ignore' });
    }
  }
}

export default async function runExecutor(
  options: SandboxExecutorSchema,
  context: ExecutorContext
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
      `[nx-oc:sandbox] Could not determine the application type for ${projectName}.`
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

    // ---- service client secret (node services authenticate to ADSP) ----
    // Upserted from the current .env.local so re-runs pick up a rotated secret.
    // CLIENT_SECRET lives in .env.local, not .env (@abgov/nx-adsp's
    // express-service writes it there — it's a generated, local-only value,
    // the same tier `nx dev-db` uses for DATABASE_URL/MONGODB_URI).
    if (appType === 'node') {
      run(
        'Upsert CLIENT_SECRET',
        `oc create secret generic ${projectName}-secrets ` +
          `--from-literal=CLIENT_SECRET="$(grep -E '^CLIENT_SECRET=' ${projectRoot}/.env.local 2>/dev/null | cut -d= -f2-)" ` +
          `-n ${sandboxProject} --dry-run=client -o yaml | oc apply -f -`,
        cwd
      );
    }

    // ---- shared database provisioning ----
    if (database === 'postgres') {
      run(
        'Ensure Postgres credentials',
        `oc get secret sandbox-postgres-creds -n ${sandboxProject} 2>/dev/null || ` +
          `oc create secret generic sandbox-postgres-creds ` +
          `--from-literal=POSTGRESQL_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=') ` +
          `-n ${sandboxProject}`,
        cwd
      );
      run(
        'Deploy shared Postgres',
        `oc apply -f .openshift/sandbox/sandbox-postgres.yml -n ${sandboxProject}`,
        cwd
      );
      // The shared Postgres only creates the admin database; each app needs its
      // own <app>_sandbox database created before its migrate init container
      // runs. Wait for Postgres, then create the database idempotently.
      const dbName = `${projectName}_sandbox`;
      run(
        'Create app database',
        `oc rollout status deployment/sandbox-postgres -n ${sandboxProject} --timeout=180s && ` +
          `oc exec -n ${sandboxProject} deployment/sandbox-postgres -- ` +
          `bash -lc "psql -U postgres -tc \\"SELECT 1 FROM pg_database WHERE datname='${dbName}'\\" ` +
          `| grep -q 1 || createdb -U postgres ${dbName}"`,
        cwd
      );
    } else if (database === 'mongo') {
      run(
        'Ensure MongoDB credentials',
        `oc get secret sandbox-mongodb-creds -n ${sandboxProject} 2>/dev/null || ` +
          `oc create secret generic sandbox-mongodb-creds ` +
          `--from-literal=MONGODB_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=') ` +
          `-n ${sandboxProject}`,
        cwd
      );
      run(
        'Deploy shared MongoDB',
        `oc apply -f .openshift/sandbox/sandbox-mongodb.yml -n ${sandboxProject}`,
        cwd
      );
    }

    // ---- paired backend Services (so a frontend's nginx resolves proxy_pass
    // upstreams at startup). Only the Service is needed for DNS. Idempotent. ----
    const proxyServices = (project.tags ?? [])
      .filter((tag) => tag.startsWith(PROXY_TAG_PREFIX))
      .map((tag) => {
        const value = tag.slice(PROXY_TAG_PREFIX.length);
        const lastColon = value.lastIndexOf(':');
        return { name: value.slice(0, lastColon), port: value.slice(lastColon + 1) };
      });
    for (const { name, port } of proxyServices) {
      run(
        `Ensure paired Service ${name}`,
        `oc get service ${name} -n ${sandboxProject} >/dev/null 2>&1 || ` +
          `oc create service clusterip ${name} --tcp=${port}:${port} -n ${sandboxProject}`,
        cwd
      );
    }

    // The Service stub above only stops nginx crashlooping; the backend needs
    // its own pods for /api proxying to work. Deploy it (opt-in) or warn that
    // proxied calls will 502 until it is deployed separately.
    for (const { name } of proxyServices) {
      if (deployBackend) {
        try {
          run(`Deploy paired backend ${name}`, `npx nx run ${name}:sandbox`, cwd);
        } catch {
          throw new Error(
            `--deployBackend: could not deploy paired backend "${name}". Ensure it has a sandbox target ` +
              `(nx g @abgov/nx-oc:sandbox ${name} --sandboxProject ${sandboxProject}).`
          );
        }
      } else {
        const endpoints = capture(
          `oc get endpoints ${name} -n ${sandboxProject} -o jsonpath='{.subsets[*].addresses[*].ip}'`,
          cwd
        );
        if (!endpoints) {
          logger.warn(
            `\n⚠ Paired backend "${name}" has no running pods in ${sandboxProject}. ` +
              `The frontend will deploy, but requests proxied to ${name} will 502 until it is deployed:\n` +
              `    nx run ${name}:sandbox\n` +
              `  (or re-run this target with --deployBackend to deploy it first).`
          );
        }
      }
    }

    // ---- build locally + push to the registry ----
    if (!skipBuild) {
      run(
        'Build',
        `npx nx build ${projectName} --configuration production`,
        cwd
      );
      run(
        'Podman build',
        `podman build --platform=linux/amd64 -f .openshift/${projectName}/Dockerfile -t ${imageRef} .`,
        cwd
      );
    }
    if (!skipPush) {
      // gh supplies the token so no PAT is stored; the same session token backs
      // the pull secret below.
      run(
        'Registry login',
        `gh auth token | podman login ${registryHost} -u "$(gh api user -q .login)" --password-stdin`,
        cwd
      );
      run('Push image', `podman push ${imageRef}`, cwd);
    }

    // ---- import into the namespace imagestream + roll out ----
    // Per-deploy pull secret from the gh session (no long-lived PAT needed).
    run(
      'Upsert pull secret',
      `oc create secret docker-registry ghcr-pull ` +
        `--docker-server=${registryHost} --docker-username="$(gh api user -q .login)" --docker-password="$(gh auth token)" ` +
        `-n ${sandboxProject} --dry-run=client -o yaml | oc apply -f -`,
      cwd
    );
    // oc tag sets/repoints the imagestream tag with reference-policy=local so
    // pods pull in-cluster; import --confirm then pulls the current manifest.
    run(
      'Tag imagestream',
      `oc tag ${imageRef} ${projectName}:${imageTag} --reference-policy=local -n ${sandboxProject}`,
      cwd
    );
    importWithRetry(
      `${projectName}:${imageTag}`,
      sandboxProject,
      cwd,
      importRetries
    );

    run(
      'Apply manifest',
      `oc process -f .openshift/${projectName}/${projectName}.yml -p PROJECT=${sandboxProject} | oc apply -f -`,
      cwd
    );
    run(
      'Restart rollout',
      `oc rollout restart deployment/${projectName} -n ${sandboxProject}`,
      cwd
    );
    run(
      'Wait for rollout',
      `oc rollout status deployment/${projectName} -n ${sandboxProject} --timeout=180s`,
      cwd
    );

    logger.info(`\n✓ Sandbox deploy complete for ${projectName}.`);
    return { success: true };
  } catch (err) {
    logger.error(`\n[nx-oc:sandbox] ${(err as Error).message}`);
    return { success: false };
  }
}
