import { execFileSync } from 'child_process';
import type { VerifyConditionsContext } from 'semantic-release';
import type { WrappedPluginConfig } from './wrap-plugin';

// Must match GIT_NOTE_REF in semantic-release/lib/definitions/constants.js.
// If that constant changes, this fix breaks — see README for full explanation.
const GIT_NOTE_REF = 'semantic-release';

interface BranchTag {
  gitTag: string;
  channels: (string | null)[];
}

// Corrects context.branch.tags channel state before getReleaseToAdd reads it.
//
// When multiple projects release on the same commit, semantic-release's glob-
// based note read (--notes=refs/notes/semantic-release*) conflates notes from
// multiple per-tag note refs. After the first project is promoted to the latest
// channel, all tags on that commit incorrectly appear to already be on the null
// channel, preventing remaining projects from being promoted.
//
// This runs in the window between getBranches (which populates context.branch.tags
// via the glob read) and getReleaseToAdd (which acts on channels). It re-reads
// each tag's note via its specific ref to get the correct channel state.
// See README for the semantic-release internals this depends on.
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
