import {
  formatFiles,
  generateFiles,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nx/devkit';
import * as path from 'path';
import * as yaml from 'yaml';
import { pipelineEnvs as envs } from '../../pipeline-envs';
import { getGitRemoteUrl } from '../../utils/git-utils';
import { detectApplicationType, getBuildOutputPath } from '../../utils/app-type';
import { NormalizedSchema, Schema } from './schema';
import { getAdspConfiguration } from '../../adsp';

const infraManifestFile = '.openshift/environments.yml';

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const projectName = names(options.project).fileName;

  const result = host.read(infraManifestFile).toString();
  const { items } = yaml.parse(result);
  const ocInfraProject = items[0]?.metadata?.namespace || '';

  const SA_PREFIX = 'system:serviceaccounts:';
  const ocEnvProjects = items[0]?.subjects
    ?.filter((s) => s.kind === 'Group' && s.name.startsWith(SA_PREFIX))
    .map((s) => s.name.replace(SA_PREFIX, ''));

  const config = readProjectConfiguration(host, projectName);
  const appType = options.appType ?? detectApplicationType(config);

  const adsp = await getAdspConfiguration(host, options);

  return {
    ...options,
    appType,
    adsp,
    projectName,
    ocInfraProject,
    ocEnvProjects,
    buildOutputPath: getBuildOutputPath(config),
  };
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...options.adsp,
    sourceRepositoryUrl: getGitRemoteUrl(),
    database: options.database ?? 'none',
    sandbox: options.sandbox ?? false,
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, `${options.appType}-files`),
    `./.openshift/${options.projectName}`,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  const config = readProjectConfiguration(host, options.project);
  if (config.projectType !== 'application') {
    console.log('Cannot generate deployment for library.');
    return;
  }

  if (!host.exists(infraManifestFile)) {
    console.log(
      `Cannot generate deployment; run 'nx g @abgov/nx-oc:pipeline' first.`
    );
    return;
  }

  const normalizedOptions = await normalizeOptions(host, options);
  if (!normalizedOptions.appType) {
    console.log('Cannot generate deployment for unknown project type.');
    return;
  }

  config.targets = {
    ...config.targets,
    'apply-envs': {
      executor: '@abgov/nx-oc:apply',
      options: {
        ocProject: normalizedOptions.ocEnvProjects.map((project, i) => ({
          project,
          tag: envs[i]?.toLowerCase(),
        })),
      },
    },
  };

  updateProjectConfiguration(host, options.project, config);

  addFiles(host, normalizedOptions);
  await formatFiles(host);
}
