// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
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

/**
 * The source's own predicate, applied to a list of paths, IN A CHILD PROCESS.
 *
 * The predicate must come from the source — a copy of its rules living here is the defect this
 * package exists to remove — so its ESM module has to be loaded somehow. An earlier version did
 * that in-process with `new Function('return import(specifier)')`, to stop the CommonJS build
 * downlevelling the import into a `require` that cannot load ESM. That worked and was fragile in
 * two ways, one of which CI caught: a native import is invisible to a test runner's module
 * registry, so its resolution landed after a sibling suite's environment was torn down and failed
 * the run while every suite passed.
 *
 * A child process fixes it by construction and is better on its own terms. The boundary is
 * explicit — foreign code runs in its own process rather than inside this one — and the whole list
 * is filtered in ONE call rather than a predicate being invoked per path, so the crossing is paid
 * once. What comes back is still entirely the source's answer.
 */
const FILTER_SCRIPT = [
  'const { pathToFileURL } = await import("node:url");',
  'const m = await import(pathToFileURL(process.argv[1]).href);',
  'const read = new Promise((r) => { let d = ""; process.stdin.on("data", (c) => (d += c)).on("end", () => r(d)); });',
  'const paths = JSON.parse(await read);',
  // The WHOLE question, or nothing. An older source exporting only the exclude half cannot answer
  // what travels, and answering on its behalf would be this package holding an opinion about the
  // source's rules.
  'if (typeof m.travels !== "function") { process.exit(3); }',
  'process.stdout.write(JSON.stringify(paths.filter((p) => m.travels(p))));',
].join('\n');

const NO_PREDICATE = 3;

function filterTravelling(
  root: string,
  paths: readonly string[],
  commit: string,
): string[] {
  const result = spawnSync(
    'node',
    [
      '--input-type=module',
      '-e',
      FILTER_SCRIPT,
      join(root, SOURCE_LAYOUT.predicateModule),
    ],
    { input: JSON.stringify(paths), encoding: 'utf-8' },
  );

  if (result.status === NO_PREDICATE || result.error) {
    throw new SourceRefused({
      condition: 'source-exports-no-predicate',
      commit,
    });
  }
  if (result.status !== 0) {
    throw new SourceRefused({
      condition: 'source-exports-no-predicate',
      commit,
    });
  }
  return JSON.parse(result.stdout) as string[];
}

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

export function resolveSource(root: string): ResolvedSource {
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

  // The travelling set is computed HERE, from this source's own index, so `travels` below is a
  // membership test over an answer the source already gave rather than a process crossing per
  // path.
  const travelling = new Set(
    filterTravelling(root, trackedPaths(root), commit),
  );

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
    travels: (p: string) => travelling.has(p),
  };
}
