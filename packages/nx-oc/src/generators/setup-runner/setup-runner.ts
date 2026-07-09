import { Tree } from '@nx/devkit';
import {
  createGenericSecret,
  ensureOcLogin,
  rolloutRestartDeployment,
  runOcCommand,
} from '../../utils/oc-utils';
import { checkGhCli, promptForGitHubPat, setGhVariable } from '../../utils/gh-utils';
import { getGitHubRepo, getGitRemoteUrl } from '../../utils/git-utils';
import { Schema } from './schema';

const RUNNER_MANIFEST = '.openshift/github-runner/deployment.yml';

// Provisions the self-hosted Playwright e2e runner as one cohesive unit: its
// registration secret, the Deployment (piped from the tree, like apply-infra),
// and the RUN_E2E gate. Runs after setup-secrets so the secret exists before the
// Deployment. The optional goa-ca CA configmap stays manual — we don't have the
// cert (see .openshift/github-runner/README.md).
export default async function (host: Tree, options: Schema) {
  if (!host.exists(RUNNER_MANIFEST)) {
    console.log(
      `\n⚠  No runner manifest at ${RUNNER_MANIFEST} — generate the pipeline first:\n` +
      '   npx nx g @abgov/nx-oc:pipeline\n'
    );
    return;
  }

  try {
    ensureOcLogin();
  } catch (e) {
    console.log(e instanceof Error ? e.message : String(e));
    return;
  }

  const repo = getGitHubRepo(getGitRemoteUrl()?.trim());
  if (!repo) {
    console.log(
      '\n⚠  No GitHub remote found — skipping e2e runner setup.\n' +
      '   Push to GitHub first then re-run this generator.'
    );
    return;
  }

  try {
    checkGhCli();
  } catch (e) {
    console.log(e instanceof Error ? e.message : String(e));
    return;
  }

  // repo scope (admin:org for an org-wide runner) lets the runner self-register.
  // The pipeline generator prompts once and passes the PAT in; a standalone run
  // prompts here.
  const pat = options.pat ?? await promptForGitHubPat(
    'Enter a GitHub PAT with repo scope (admin:org for an org-wide runner) to register the e2e runner:'
  );
  if (!pat) return;

  console.log('\nProvisioning the self-hosted e2e runner...');

  const patSecret = createGenericSecret('github-runner-pat', { pat }, options.infra);
  console.log(patSecret ? '✓ github-runner-pat secret created' : '✗ Failed to create github-runner-pat secret');
  if (!patSecret) return;

  const { success } = runOcCommand('apply', [], host.read(RUNNER_MANIFEST));
  console.log(success ? '✓ e2e runner Deployment applied' : '✗ Failed to apply e2e runner Deployment');
  if (!success) return;

  // Restart so a re-run with a new PAT is picked up — the pod reads the secret
  // only at start. Harmless on the first apply (the pod is just starting).
  rolloutRestartDeployment('github-runner-playwright', options.infra);

  const varSet = setGhVariable('RUN_E2E', 'true', repo);
  console.log(
    varSet
      ? '✓ RUN_E2E enabled — e2e jobs will run on the runner'
      : '✗ Failed to set RUN_E2E — enable it manually: gh variable set RUN_E2E --body true'
  );
  console.log(
    '\n  The runner is registering under the repo\'s Settings → Actions → Runners\n' +
    '  (label "playwright"). If internal routes use a private CA, also create the\n' +
    '  optional goa-ca configmap — see .openshift/github-runner/README.md.\n'
  );
}
