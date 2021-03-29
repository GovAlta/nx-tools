import { ExecutorContext } from '@nrwl/devkit';
import { runOcCommand } from '../../utils/oc-utils';
import { NormalizedSchema, Schema } from './schema';

function normalizeSchema(options: Schema): NormalizedSchema {

  let ocProjects: string[];
  if(!Array.isArray(options.ocProject)) {
    ocProjects = [options.ocProject];
  } else {
    ocProjects = [...options.ocProject]
  }

  return { ocProjects }
}

export default async function runExecutor(
  options: Schema, 
  { projectName }: ExecutorContext
): Promise<{ success: boolean }> {
  console.log(`Running oc apply for ${projectName}...`);

  const { ocProjects } = normalizeSchema(options);

  const failed = ocProjects.map(ocProject => {
    const { success, stdout } = runOcCommand(
      'process', 
      [
        `-f .openshift/${projectName}/${projectName}.yml`,
        `-p PROJECT=${ocProject}`
      ]
    );
  
    return success && 
      runOcCommand('apply', [], stdout).success;
  }).filter((success) => !success);

  return {
    success: !failed.length
  }
}
