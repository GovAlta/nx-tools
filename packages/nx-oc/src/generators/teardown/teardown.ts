import {
  formatFiles,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nx/devkit';
import * as yaml from 'yaml';
import { pipelineEnvs as envs } from '../../pipeline-envs';
import { NormalizedSchema, Schema } from './schema';

const infraManifestFile = '.openshift/environments.yml';

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const projectName = names(options.project).fileName;

  const result = host.read(infraManifestFile).toString();
  const { items } = yaml.parse(result);
  const ocInfraProject = items[0]?.metadata?.namespace || '';

  const SA_PREFIX = 'system:serviceaccounts:';
  const ocEnvProjects: string[] = items[0]?.subjects
    ?.filter((s) => s.kind === 'Group' && s.name.startsWith(SA_PREFIX))
    .map((s) => s.name.replace(SA_PREFIX, ''));

  const envIndex = envs.map((e) => e.toLowerCase()).indexOf(options.env.toLowerCase());
  const envProject = ocEnvProjects?.[envIndex] || '';

  return {
    ...options,
    projectName,
    ocInfraProject,
    envProject,
  };
}

export default async function (host: Tree, options: Schema) {
  if (!host.exists(infraManifestFile)) {
    console.log(`Cannot generate teardown; run 'nx g @abgov/nx-oc:pipeline' first.`);
    return;
  }

  const normalizedOptions = normalizeOptions(host, options);
  if (!normalizedOptions.envProject) {
    console.log(`Cannot find project for environment '${options.env}'.`);
    return;
  }

  const config = readProjectConfiguration(host, options.project);
  const { projectName, envProject } = normalizedOptions;

  config.targets = {
    ...config.targets,
    [`teardown-${options.env}`]: {
      executor: 'nx:run-commands',
      options: {
        commands: [
          `oc delete all,configmap -l app=${projectName} -n ${envProject} --ignore-not-found`,
        ],
      },
    },
  };

  updateProjectConfiguration(host, options.project, config);
  await formatFiles(host);
}
