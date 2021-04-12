import { ExecutorContext } from '@nrwl/devkit';
import { runDotnetCommand } from '../../utils/dotnet-utils';
import { NormalizedSchema, Schema } from './schema';

function normalizeOptions(options: Schema, context: ExecutorContext): NormalizedSchema {
  
  return {
    csProject: options.csProject || 
      context.workspace.projects[context.projectName].root
  }
}

export default async function runExecutor(options: Schema, context: ExecutorContext) {
  const normalizedOptions = normalizeOptions(options, context)
  const result = await runDotnetCommand(
    'test',
    normalizedOptions.csProject
  )

  return result;
}
