import { execSync } from 'child_process'

export function getGitRemoteUrl(): string {
  try {
    const stdout = execSync(
      "git config --get remote.origin.url", 
      { stdio: "pipe" }
    ).toString()

    return stdout
  } catch (e) {
    console.log(`Failed to execute git`, e)
  }
}
