import { execSync } from 'child_process';

export function runOcCommand(
  command: 'project' | 'start-build' | 'process' | 'apply',
  params: string[],
): { success: boolean} {
  const execute = `oc ${command} ${params.join(' ')}`;

  try {
    console.log(`Executing command: ${execute}`);
    execSync(execute, { stdio: 'pipe' });
    return { success: true };
  } catch (e) {
    console.log(`Failed to execute command: ${execute}`, e);
    return { success: false };
  }
}
