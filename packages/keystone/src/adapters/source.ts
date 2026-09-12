// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { Refusal } from '../core/refusal';

/**
 * The one harness repository this installer reads. A CONSTANT, with no option that redirects it:
 * because the fetch cannot be pointed elsewhere, access to this repository is what the trust
 * boundary actually is — the same boundary that already governs obtaining the harness by any other
 * means. A caller-supplied repository would move that boundary to whatever the caller named, at
 * which point an authenticated fetch would guarantee nothing about whose code gets imported,
 * spawned, and installed as a commit hook.
 */
export const PINNED_REPOSITORY = 'GovAlta-EMU/keystone';

/**
 * Where the source keeps the two things this installer reads. Held in one place so the coupling to
 * the source's layout is one edit rather than several; it is structural knowledge (where the
 * declaration lives), never a copy of the declaration itself.
 */
export const SOURCE_LAYOUT = {
  manifest: '.claude/inventory.json',
  predicateModule: '.claude/lib/inventory.mjs',
  upgradeTool: '.claude/skills/upgrade/scripts/upgrade.mjs',
} as const;

export class SourceRefused extends Error {
  constructor(readonly refusal: Refusal) {
    super(refusal.condition);
  }
}

/**
 * A resolved source: a tree, the commit it is at, and the source's own travel predicate.
 *
 * Only ever produced by `resolveSource`, which is the candidate-to-resolved transition — per
 * domain-terms:resolved-source a tree that fails the identity check was never a resolved source at
 * all, so nothing downstream has to re-check it.
 */
export interface ResolvedSource {
  readonly root: string;
  readonly commit: string;
  readonly version: string;
  /**
   * The step ids the source declares.
   *
   * Carried so the handoff can VERIFY the command it names instead of restating one — the
   * hand-written installer printed a command that had not existed for three months because the
   * name lived in prose nothing checked.
   */
  readonly declaredSteps: readonly string[];
  /** The source's own answer to "does this path reach a project". */
  readonly travels: (relPath: string) => boolean;
}

// `import()` in a CommonJS build is downleveled to `require()`, which cannot load the source's
// ESM module. This is the standard escape hatch: a real dynamic import the compiler will not
// rewrite. It exists because the predicate MUST come from the source rather than be reimplemented
// here, so loading its module is not optional.
const importModule: (specifier: string) => Promise<Record<string, unknown>> =
  new Function('specifier', 'return import(specifier);') as never;

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** The source's tracked files: its git index, which is the universe the declared set is drawn from. */
export function trackedPaths(root: string): string[] {
  const out = git(root, ['ls-files', '-z']);
  return out.split('\0').filter((p) => p.length > 0);
}

export async function resolveSource(root: string): Promise<ResolvedSource> {
  const manifestPath = join(root, SOURCE_LAYOUT.manifest);
  if (!existsSync(manifestPath)) {
    throw new SourceRefused({ condition: 'source-not-a-harness', path: root });
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const harness = manifest?.harness ?? {};
  const declaredRepo: string = harness.sourceRepo ?? 'nothing';
  const version: string = harness.version ?? 'unknown';
  const commit = git(root, ['rev-parse', 'HEAD']);

  // The identity check, against the PINNED constant rather than against whatever was requested.
  // Compared against a constant it is a real guard on the fetch route, because a fetch cannot be
  // redirected. On a caller-supplied local path it is a wrong-path guard and nothing more: the
  // declaration is part of the tree being judged, so a hostile tree declares whatever it likes.
  if (declaredRepo !== PINNED_REPOSITORY) {
    throw new SourceRefused({
      condition: 'source-identity-mismatch',
      declared: declaredRepo,
      expected: PINNED_REPOSITORY,
    });
  }

  if (!manifest?.distribution) {
    throw new SourceRefused({
      condition: 'source-declares-no-set',
      commit,
      version,
    });
  }

  let loaded: Record<string, unknown>;
  try {
    loaded = await importModule(
      pathToFileURL(join(root, SOURCE_LAYOUT.predicateModule)).href,
    );
  } catch {
    // A structured refusal rather than a module-resolution stack trace, because --json exists for
    // exactly this: a caller that cannot read the failure cannot act on it.
    throw new SourceRefused({
      condition: 'source-exports-no-predicate',
      commit,
    });
  }

  // The source's WHOLE-QUESTION predicate, or nothing. An earlier version accepted an older
  // export shape and applied the source's include list using this package's own idea of how such
  // a list matches a path — which is a copy of the source's semantics, the one thing
  // domain-terms:declared-distribution-set forbids outright. The list comes from the source and so
  // does the meaning of the list; a source that cannot answer the whole question is refused rather
  // than answered on its behalf.
  if (typeof loaded.travels !== 'function') {
    throw new SourceRefused({
      condition: 'source-exports-no-predicate',
      commit,
    });
  }

  const declaredSteps = Array.isArray(manifest?.skills)
    ? manifest.skills
        .map((skill: unknown) => (skill as { id?: unknown } | null)?.id)
        .filter((id: unknown): id is string => typeof id === 'string')
    : [];

  return {
    root,
    commit,
    version,
    declaredSteps,
    travels: loaded.travels as (p: string) => boolean,
  };
}
