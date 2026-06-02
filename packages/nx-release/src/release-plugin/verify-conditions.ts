import { execFileSync } from 'child_process';
import type { VerifyConditionsContext } from 'semantic-release';
import type { WrappedPluginConfig } from './wrap-plugin';

const GIT_NOTE_REF = 'semantic-release';

interface BranchTag {
  gitTag: string;
  channels: (string | null)[];
}

export async function verifyConditions(
  _pluginConfig: WrappedPluginConfig,
  context: VerifyConditionsContext
): Promise<void> {
  const { cwd, logger } = context;
  const tags: BranchTag[] = context.branch['tags'] ?? [];

  for (const branchTag of tags) {
    const noteRef = `${GIT_NOTE_REF}-${branchTag.gitTag}`;
    try {
      const stdout = execFileSync(
        'git',
        ['notes', '--ref', noteRef, 'show', branchTag.gitTag],
        { cwd, stdio: 'pipe' }
      ).toString().trim();

      const note = JSON.parse(stdout);
      if (Array.isArray(note?.channels)) {
        logger.log(
          `Correcting channels for ${branchTag.gitTag}: ${JSON.stringify(note.channels)}`
        );
        branchTag.channels = note.channels;
      }
    } catch (e) {
      // No note for this tag or unparseable — leave channels as-is
    }
  }
}
