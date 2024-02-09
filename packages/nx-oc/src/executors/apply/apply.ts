import { ExecutorContext } from '@nx/devkit';
import { pipelineEnvs as envs } from '../../pipeline-envs';
import { runOcCommand } from '../../utils/oc-utils';
import { NormalizedSchema, PipelineEnvironment, Schema } from './schema';

function mapOcProject(
  project: string | PipelineEnvironment,
  i: number
): PipelineEnvironment {
  if (typeof project === 'string') {
    return { project: 'string', tag: envs[i].toLowerCase() };
  } else {
    return project;
  }
}

function normalizeSchema(options: Schema): NormalizedSchema {
  const ocProjects = Array.isArray(options.ocProject)
    ? options.ocProject.map(mapOcProject)
    : [mapOcProject(options.ocProject, 0)];

  return { ocProjects };
}

export default async function runExecutor(
  options: Schema,
  { projectName }: ExecutorContext
): Promise<{ success: boolean }> {
  console.log(`Running oc apply for ${projectName}...`);

  const { ocProjects } = normalizeSchema(options);

  const failed = ocProjects
    .map(({ project, tag }) => {
      const processResult = runOcCommand('process', [
        `-f .openshift/${projectName}/${projectName}.yml`,
        `-p PROJECT=${project}`,
        `-p DEPLOY_TAG=${tag}`,
      ]);

      if (!processResult.success) {
        return false;
      } else {
        const { success, stdout } = runOcCommand(
          'apply',
          [],
          processResult.stdout
        );
        console.log(stdout?.toString());

        return success;
      }
    })
    .filter((success) => !success);

  return {
    success: !failed.length,
  };
}
