import { execSync } from 'child_process';

export function runOcCommand(
  command: 'project' | 'start-build' | 'process' | 'apply',
  params: string[],
  input?: Buffer
): { success: boolean} {
  const execute = !input ?
    `oc ${command} ${params.join(' ')}` :
    `cat | oc ${command} ${['-f -', ...params].join(' ')}`;

  try {
    console.log(`Executing command: ${execute}`);
    execSync(execute, { stdio: 'pipe', input });
    return { success: true };
  } catch (e) {
    console.log(`Failed to execute command: ${execute}`, e);
    return { success: false };
  }
}
