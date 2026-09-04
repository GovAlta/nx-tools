import { execFileSync, execSync } from 'child_process';

// A one-shot, non-interactive CLI call, not a conversation — long enough for
// a real response, short enough that a hung/unresponsive CLI never blocks
// report generation. Deliberately independent of nx-adsp's consultAgent
// (which is a different mechanism entirely: an interactive, multi-turn
// conversation with one specific ADSP-hosted agent persona, gated off in
// non-interactive/CI contexts — the opposite of what a report generator
// needs).
const CLI_TIMEOUT_MS = 30_000;

// `command -v` is a shell builtin, not an executable — this can't use
// execFileSync (there's no `command` binary to exec), same reasoning as the
// identical check in nx-oc's sandbox executor.
function isOnPath(command: string): boolean {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore', shell: '/bin/bash' });
    return true;
  } catch {
    return false;
  }
}

// execFileSync (argv array, no shell) rather than execSync (shell string) —
// the prompt embeds artifact free-text bodies we don't control the contents
// of, so it must never be interpolated into a shell command string.
export function tryClaudeCli(prompt: string): string | undefined {
  if (!isOnPath('claude')) {
    return undefined;
  }
  try {
    const output = execFileSync(
      'claude',
      ['-p', prompt, '--output-format', 'text'],
      { timeout: CLI_TIMEOUT_MS, encoding: 'utf-8' },
    );
    return output.trim() || undefined;
  } catch {
    return undefined;
  }
}

// Checks the `copilot` binary directly, not `gh` — `gh copilot` downloads
// the Copilot CLI on first use if it isn't already installed, and report
// generation shouldn't silently trigger that side effect just to check
// availability.
export function tryCopilotCli(prompt: string): string | undefined {
  if (!isOnPath('copilot')) {
    return undefined;
  }
  try {
    const output = execFileSync('gh', ['copilot', '-p', prompt], {
      timeout: CLI_TIMEOUT_MS,
      encoding: 'utf-8',
    });
    return output.trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface StatusCounts {
  totalArtifacts: number;
  byType: Record<string, number>;
  open: number;
  resolved: number;
  unreferenced: number;
  brokenRefs: number;
}

// The final fallback, and the only one that's always available regardless
// of environment — computed straight from the same counts the rest of the
// report already shows, so it's never out of sync with the numbers next to
// it, just less readable than a real narrative.
export function buildDeterministicSummary(counts: StatusCounts): string {
  const typeBreakdown = Object.entries(counts.byType)
    .map(([type, n]) => `${n} ${type}`)
    .join(', ');
  const sentences = [
    `${counts.totalArtifacts} project-docs artifact(s) tracked` +
      (typeBreakdown ? ` (${typeBreakdown}).` : '.'),
  ];
  if (counts.open > 0 || counts.resolved > 0) {
    sentences.push(`${counts.resolved} resolved, ${counts.open} still open.`);
  }
  if (counts.unreferenced > 0) {
    sentences.push(
      `${counts.unreferenced} unreferenced (nothing derives from them yet).`,
    );
  }
  if (counts.brokenRefs > 0) {
    sentences.push(`${counts.brokenRefs} broken reference(s).`);
  }
  return sentences.join(' ');
}

export type SynthesisSource = 'claude' | 'copilot' | 'deterministic';

export interface SynthesisResult {
  text: string;
  source: SynthesisSource;
}

// Cascades through whichever already-authenticated coding-agent CLI is
// available in the environment before falling back to the deterministic
// summary — no new dependency, no separate API key for the consuming
// workspace to provision. `noSynthesis` skips the cascade entirely (CI, or
// anyone who wants reproducible, LLM-independent report diffs).
export function synthesize(
  prompt: string,
  deterministicSummary: string,
  noSynthesis: boolean,
): SynthesisResult {
  if (!noSynthesis) {
    const claude = tryClaudeCli(prompt);
    if (claude) {
      return { text: claude, source: 'claude' };
    }
    const copilot = tryCopilotCli(prompt);
    if (copilot) {
      return { text: copilot, source: 'copilot' };
    }
  }
  return { text: deterministicSummary, source: 'deterministic' };
}
