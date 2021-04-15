import { once } from 'events';
import * as execa from 'execa';

export async function runDotnetCommand(
  command: 'build' | 'test' | 'run' | '--info',
  ...params: string[]
) {
  try {
    const result = execa(
      'dotnet',
      [
        command,
        ...params
      ]
    );
    result.stdout.pipe(process.stdout);

    await once(result, 'close');
    console.log('what');
    return { success: true }
  } catch (e) {
    console.log(`Failed to execute command: ${command}`, e);
    return { success: false }
  }
}
