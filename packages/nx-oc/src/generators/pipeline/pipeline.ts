import { formatFiles, generateFiles, Tree } from '@nx/devkit';
import * as path from 'path';
import { pipelineEnvs as envs } from '../../pipeline-envs';
import { deriveRegistryFromRemote, getGitRemoteUrl } from '../../utils/git-utils';
import applyInfraGenerator from '../apply-infra/apply-infra';
import setupSecretsGenerator from '../setup-secrets/setup-secrets';
import { NormalizedSchema, Schema } from './schema';

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const ocEnvProjects = options.envs?.split(' ') || [options.infra];

  const envsProjectsSet = new Set(ocEnvProjects);
  if (envsProjectsSet.size !== ocEnvProjects.length) {
    throw new Error('Each environment must be a unique project.');
  } else if (ocEnvProjects.length > envs.length) {
    throw new Error(
      `Provided projects must correspond to ${envs.join(', ')} environments.`
    );
  }

  return {
    ...options,
    registry: options.registry ?? '',
    ocPipelineName: options.pipeline,
    ocInfraProject: options.infra,
    ocEnvProjects: ocEnvProjects,
    applyPipeline: !!options.apply,
    pipelineType: options.type === 'jenkins' ? 'jenkins' : 'actions',
  };
}

// Resolves the container registry: CLI flag → derived from git remote → prompted.
async function resolveRegistry(registry?: string): Promise<string> {
  if (registry) return registry;

  const remoteUrl = getGitRemoteUrl()?.trim();
  const derived = deriveRegistryFromRemote(remoteUrl);
  if (derived) {
    console.log(`\n✓ Container registry: ${derived} (derived from git remote)\n`);
    return derived;
  }

  const { prompt } = await import('enquirer');
  const answer = await prompt<{ registry: string }>({
    type: 'input',
    name: 'registry',
    message: 'What container registry should images be published to (e.g., ghcr.io/my-org)?',
  });
  return answer.registry;
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    sourceRepositoryUrl: getGitRemoteUrl()?.trim(),
    envs,
    tmpl: '',
  };

  if (options.pipelineType === 'jenkins') {
    console.warn(
      'WARNING: Jenkins pipeline support is deprecated and will be removed in the next major version. ' +
        'Use --type actions instead.'
    );
    generateFiles(
      host,
      path.join(__dirname, 'jenkins'),
      `./.openshift`,
      templateOptions
    );
  } else if (options.pipelineType === 'actions') {
    generateFiles(
      host,
      path.join(__dirname, 'actions/openshift'),
      `./.openshift`,
      templateOptions
    );
    generateFiles(
      host,
      path.join(__dirname, 'actions/workflows'),
      `./.github/workflows`,
      templateOptions
    );
  }
}

export default async function (host: Tree, options: Schema) {
  const registry = await resolveRegistry(options.registry);
  const normalizedOptions = normalizeOptions(host, { ...options, registry });

  addFiles(host, normalizedOptions);
  await formatFiles(host);

  if (normalizedOptions.applyPipeline) {
    await applyInfraGenerator(host);

    const remoteUrl = getGitRemoteUrl()?.trim();
    if (remoteUrl) {
      await setupSecretsGenerator(host, { infra: normalizedOptions.ocInfraProject });
    } else {
      console.log(
        '\n⚠  No git remote found — skipping GitHub secrets setup.\n' +
        `   Push to GitHub first then run:\n` +
        `   npx nx g @abgov/nx-oc:setup-secrets --infra ${normalizedOptions.ocInfraProject}\n`
      );
    }
  }
}
