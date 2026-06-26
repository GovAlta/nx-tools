import { execFileSync, spawnSync } from 'child_process';

export function getOcServerUrl(): string | undefined {
  try {
    return execFileSync(
      'oc',
      ['config', 'view', '--minify', '-o', 'jsonpath={.clusters[0].cluster.server}'],
      { stdio: 'pipe' }
    ).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

// Creates a bounded SA token valid for one year (OCP 4.11+ TokenRequest API).
// Falls back to the legacy `oc sa get-token` on older clusters.
export function getSaToken(saName: string, namespace: string): string | undefined {
  try {
    return execFileSync(
      'oc', ['create', 'token', saName, '-n', namespace, '--duration=8760h'],
      { stdio: 'pipe' }
    ).toString().trim() || undefined;
  } catch {
    try {
      return execFileSync(
        'oc', ['sa', 'get-token', saName, '-n', namespace],
        { stdio: 'pipe' }
      ).toString().trim() || undefined;
    } catch {
      return undefined;
    }
  }
}

export function createDockerRegistrySecret(
  name: string,
  server: string,
  username: string,
  password: string,
  namespace: string
): boolean {
  try {
    execFileSync('oc', [
      'create', 'secret', 'docker-registry', name,
      `--docker-server=${server}`,
      `--docker-username=${username}`,
      `--docker-password=${password}`,
      '-n', namespace,
    ], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function linkSecretToServiceAccount(
  secretName: string,
  saName: string,
  namespace: string
): boolean {
  try {
    execFileSync('oc', ['secrets', 'link', saName, secretName, '--for=pull', '-n', namespace], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function runOcCommand(
  command: 'project' | 'start-build' | 'process' | 'apply',
  params: string[],
  input?: Buffer
): { success: boolean, stdout?: Buffer} {
  const args = input
    ? [command, '-f', '-', ...params]
    : [command, ...params];

  try {
    console.log(`Executing command: oc ${args.join(' ')}`);
    const stdout = execFileSync('oc', args, { stdio: 'pipe', input });
    return { success: true, stdout };
  } catch (e) {
    console.log(`Failed to execute command: oc ${args.join(' ')}`, e);
    return { success: false };
  }
}

export function ensureOcLogin(): void {
  try {
    execFileSync('oc', ['version', '--client'], { stdio: 'pipe' });
  } catch {
    throw new Error(
      "oc CLI is not installed or not on PATH. Install it from https://mirror.openshift.com/pub/openshift-v4/clients/ocp/latest/ then re-run."
    );
  }

  try {
    execFileSync('oc', ['whoami'], { stdio: 'pipe' });
    return;
  } catch {
    // not logged in — fall through to interactive login
  }

  let server: string | null = null;
  try {
    server =
      execFileSync('oc', ['config', 'view', '--minify', '-o', 'jsonpath={.clusters[0].cluster.server}'], { stdio: 'pipe' })
        .toString()
        .trim() || null;
  } catch {
    // no kubeconfig — oc login will prompt for server
  }

  console.log('Not logged in to OpenShift. Starting interactive login...');
  const loginArgs = server ? ['login', server, '--web'] : ['login', '--web'];
  const result = spawnSync('oc', loginArgs, { stdio: 'inherit' });

  if (result.status !== 0) {
    throw new Error(
      "OpenShift login failed or was cancelled. Run 'oc login' manually then re-run the generator."
    );
  }
}
