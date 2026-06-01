import { execFileSync } from 'child_process';

export function runOcCommand(
  command: 'project' | 'start-build' | 'process' | 'apply',
  params: string[],
  input?: Buffer
): { success: boolean, stdout?: Buffer} {
  const args = input
    ? [command, '-f', '-', ...params]
    : [command, ...params];

  try {
    console.log(`Executing command: oc ${args.join(' ')}`);
    const stdout = execFileSync('oc', args, { stdio: 'pipe', input });
    return { success: true, stdout };
  } catch (e) {
    console.log(`Failed to execute command: oc ${args.join(' ')}`, e);
    return { success: false };
  }
}
