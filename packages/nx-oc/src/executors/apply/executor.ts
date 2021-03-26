import { ExecutorContext } from '@nrwl/devkit';
import { runOcCommand } from '../../utils/oc-utils';
import { Schema } from './schema';

export default async function runExecutor(
  options: Schema, 
  { projectName }: ExecutorContext
) {
  console.log(`Running oc apply for ${projectName}...`);

  let ocProjects: string[];
  if(!Array.isArray(options.ocProject)) {
    ocProjects = [options.ocProject];
  } else {
    ocProjects = [...options.ocProject]
  }

  const success = !ocProjects.map(ocProject => {
    const { success, stdout } = runOcCommand(
      'process', 
      [
        `-f .openshift/${projectName}/${projectName}.yml`,
        `-p PROJECT=${ocProject}`
      ]
    );
  
    return success && 
      runOcCommand('apply', [], stdout);
  }).find(r => !r);

  return {
    success
  }
}
