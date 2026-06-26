import { Tree } from '@nx/devkit';
import {
  createDockerRegistrySecret,
  ensureOcLogin,
  getOcServerUrl,
  getSaToken,
  linkSecretToServiceAccount,
} from '../../utils/oc-utils';
import { checkGhCli, setGhSecret } from '../../utils/gh-utils';
import { deriveRegistryFromRemote, getGitHubRepo, getGitRemoteUrl } from '../../utils/git-utils';
import { Schema } from './schema';

export default async function (host: Tree, options: Schema) {
  try {
    ensureOcLogin();
  } catch (e) {
    console.log(e instanceof Error ? e.message : String(e));
    return;
  }

  const remoteUrl = getGitRemoteUrl()?.trim();
  const repo = getGitHubRepo(remoteUrl);

  if (!repo) {
    console.log(
      '\n⚠  No GitHub remote found — skipping GitHub Actions secrets setup.\n' +
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

  console.log('\nSetting up pipeline secrets...');

  const serverUrl = getOcServerUrl();
  if (serverUrl) {
    const ok = setGhSecret('OPENSHIFT_SERVER', serverUrl, repo);
    console.log(ok ? '✓ OPENSHIFT_SERVER set' : '✗ Failed to set OPENSHIFT_SERVER');
  } else {
    console.log('⚠  Could not determine OpenShift server URL — set OPENSHIFT_SERVER manually.');
  }

  const saToken = getSaToken('github-actions', options.infra);
  if (saToken) {
    const ok = setGhSecret('OPENSHIFT_TOKEN', saToken, repo);
    console.log(ok ? '✓ OPENSHIFT_TOKEN set' : '✗ Failed to set OPENSHIFT_TOKEN');
  } else {
    console.log('⚠  Could not retrieve github-actions token — set OPENSHIFT_TOKEN manually.');
  }

  const org = deriveRegistryFromRemote(remoteUrl)?.replace('ghcr.io/', '');
  if (!org) {
    console.log('⚠  Could not derive GitHub org from remote — create ghcr-pull-secret manually.');
    return;
  }

  const { prompt } = await import('enquirer');
  let pat: string;
  try {
    const answer = await prompt<{ pat: string }>({
      type: 'password',
      name: 'pat',
      message: 'Enter a GitHub PAT with read:packages scope (for OpenShift image import):',
    });
    pat = answer.pat;
  } catch {
    return;
  }

  if (!pat) return;

  const secretCreated = createDockerRegistrySecret('ghcr-pull-secret', 'ghcr.io', org, pat, options.infra);
  if (secretCreated) {
    console.log(`✓ ghcr-pull-secret created in ${options.infra}`);
    const linked = linkSecretToServiceAccount('ghcr-pull-secret', 'github-actions', options.infra);
    console.log(linked ? '✓ ghcr-pull-secret linked to github-actions service account' : '✗ Failed to link secret');
  } else {
    console.log(`✗ Failed to create ghcr-pull-secret in ${options.infra}`);
  }
}
