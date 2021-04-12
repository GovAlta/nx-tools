import * as execa from 'execa';

export async function runDotnetCommand(
  command: 'build' | 'test' | '--info',
  ...params: string[]
) {
  try {
    await execa(
      'dotnet',
      [
        command,
        ...params
      ]
    )
    return { success: true }
  } catch (e) {
    console.log(`Failed to execute command: ${command}`, e);
    return { success: false }
  }
}
