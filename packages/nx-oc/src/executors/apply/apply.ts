import { ExecutorContext } from '@nrwl/devkit';
import { runOcCommand } from '../../utils/oc-utils';
import { NormalizedSchema, Schema } from './schema';

function normalizeSchema(options: Schema): NormalizedSchema {

  const ocProjects = Array.isArray(options.ocProject) ?
    [...options.ocProject] :
    (
      options.ocProject ? 
      [options.ocProject] : 
      []
    );

  return { ocProjects }
}

export default async function runExecutor(
  options: Schema, 
  { projectName }: ExecutorContext
): Promise<{ success: boolean }> {
  console.log(`Running oc apply for ${projectName}...`);

  const { ocProjects } = normalizeSchema(options);

  const failed = ocProjects.map(ocProject => {
    const processResult = runOcCommand(
      'process', 
      [
        `-f .openshift/${projectName}/${projectName}.yml`,
        `-p PROJECT=${ocProject}`
      ]
    );

    if (!processResult.success) {
      return false;
    }
    else {
      const { success, stdout } = runOcCommand('apply', [], processResult.stdout);
      console.log(stdout?.toString());

      return success;
    }
  }).filter((success) => !success);

  return {
    success: !failed.length
  }
}
