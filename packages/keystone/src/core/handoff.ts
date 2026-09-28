// project-docs-ancestors: cli-designs:keystone-init

/** A bare identifier: what a printed instruction may name, and nothing more. */
const BARE_IDENTIFIER = /^[A-Za-z0-9_-]+$/;

/** The step this installer looks for in the source's declared skills. */
export const CONFIGURATION_STEP = 'setup';

/**
 * The reconcile step, emitted only when the placement overwrote at least one existing file.
 *
 * Overwritten files are visible via `git diff` and recoverable via `git checkout <path>` only
 * while uncommitted. Once committed the pre-image moves behind HEAD~1, so the operator must
 * review before committing — not after.
 */
const RECONCILE_STEP =
  '1. Review overwritten files with `git diff`. Recover the original content\n' +
  '   with `git checkout <path>` for any path you want to restore — this is\n' +
  '   only available before you commit.';

/**
 * Committing is always a required step, and it is not housekeeping advice.
 *
 * Placement leaves every placed file untracked, and the harness's own upgrade tool refuses a tree
 * with uncommitted changes — because an upgrade overwrites files and a clean tree is what makes it
 * reversible. So until the placement is committed, `keystone upgrade` (which this installer's own
 * refusal tells a caller to run) will not run. The two commands did not compose, and only a real
 * run against the real harness found it: a fixture-based test cannot, because a fixture commits.
 */
function commitStep(n: number): string {
  return (
    `${n}. Commit this placement. Every placed file is untracked until you do, and an upgrade\n` +
    `   needs a clean tree to be reversible — so \`keystone upgrade\` will refuse until then.`
  );
}

export type Handoff =
  | { readonly kind: 'step'; readonly step: string; readonly text: string }
  | { readonly kind: 'no-step'; readonly text: string };

/**
 * The handoff, built from what the source declares rather than from a name carried here.
 *
 * This is the whole guard, and it is worth being exact about what it guards. The hand-written
 * installer this package replaces printed `/init` for three months — a command the harness does not
 * have — because the name lived in prose nothing checked. So the name is VERIFIED against the
 * source's own declared steps: a source that does not declare it gets a handoff saying so, never a
 * guess and never an empty step.
 *
 * A declared name that is not a bare identifier is refused rather than printed. The handoff is read
 * and run by a person or an agent, and the declaration came from a fetched tree.
 */
export function buildHandoff(
  target: string,
  declaredSteps: readonly string[],
  options: { overwritten?: number } = {},
): Handoff {
  const found = declaredSteps.find((step) => step === CONFIGURATION_STEP);
  const hasOverwrites = (options.overwritten ?? 0) > 0;

  const steps = hasOverwrites
    ? `${RECONCILE_STEP}\n${commitStep(2)}`
    : commitStep(1);
  const sessionStep = hasOverwrites ? 3 : 2;

  if (!found || !BARE_IDENTIFIER.test(found)) {
    return {
      kind: 'no-step',
      text:
        `Placed the harness into ${target}.\n\n` +
        `${steps}\n` +
        `${sessionStep}. Open a new session rooted in ${target}. This source declares no configuration step\n` +
        `   this installer recognises, so read its own documentation for what to run first.\n`,
    };
  }

  return {
    kind: 'step',
    step: found,
    text:
      `Placed the harness into ${target}.\n\n` +
      `${steps}\n` +
      `${sessionStep}. Open a new session rooted in ${target}, then run /${found}.\n` +
      `   It must be a new session rooted there — the harness's own commands resolve against\n` +
      `   this project's configuration and hooks, which bind only to a session started in it.\n`,
  };
}
