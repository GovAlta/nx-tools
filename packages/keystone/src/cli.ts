// project-docs-ancestors: cli-designs:keystone-init

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { describe, nextCommand, Refusal } from './core/refusal';
import { assessTarget, chooseRoute, declaredSet, Route } from './core/rules';
import { buildHandoff } from './core/handoff';
import { redact } from './core/redact';
import { collisions, place, unconfined } from './adapters/place';
import {
  PINNED_REPOSITORY,
  resolveSource,
  SourceRefused,
  trackedPaths,
} from './adapters/source';
import { GitError, readLocalFacts } from './adapters/git';
import { fetchSource, FetchRedirected } from './adapters/fetch-source';
import { diagnose } from './adapters/diagnose';
import { checkHooksPath, wire } from './adapters/wire';
import { pinInstaller, writeProvenance } from './adapters/provenance';
import { hasUpgradeTool, runUpgradeTool } from './adapters/upgrade';

/**
 * The commands, as a function over their arguments and output channels.
 *
 * A function rather than a top-level script so the contract — the option surface, the exit status,
 * the payloads — is assertable by a test. It holds no predicate of its own: it gathers facts, hands
 * them to core, and chooses where to print and what to exit with.
 */

/** The directory whose presence means a target already carries the harness. */
export const HARNESS_DIRECTORY = '.claude';

export interface Io {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

export interface Options {
  readonly target: string;
  readonly source: string | null;
  readonly ref: string | null;
  readonly acceptLocalSource: boolean;
  readonly apply: boolean;
  readonly setup: boolean;
  readonly json: boolean;
}

/** How a source was obtained — what the run reports, beyond the resolved source itself. */
interface Provenance {
  readonly route: 'local' | 'fetch';
  readonly source: string;
  readonly cache: 'created' | 'reused' | null;
  /** Whether a local tree's own state makes its recorded commit hard for anyone else to fetch. */
  readonly unreproducible: boolean;
}

const VALUE_FLAGS = ['target', 'source', 'ref'] as const;
const BOOLEAN_FLAGS = [
  'json',
  'apply',
  'setup',
  'accept-local-source',
] as const;

export class UsageError extends Error {}

/**
 * This installer's own version, read at run time from its own manifest.
 *
 * Read rather than imported: the repository carries a placeholder the release pipeline replaces at
 * publish time, so a compiled-in literal would record the placeholder forever. `__dirname/..` is
 * the package root in both layouts.
 */
function installerVersion(): string {
  try {
    return (
      JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
        .version ?? '0.0.0'
    );
  } catch {
    return '0.0.0';
  }
}

/**
 * Both spellings of a value flag, `--k v` and `--k=v`.
 *
 * The `=` form was silently dropped by an earlier version, and unrecognised arguments were
 * discarded without a word — so `--target=/path` placed into the working directory instead. For a
 * command whose own design says a placement into the wrong directory is not undoable, an unparsed
 * argument has to be an error rather than a default.
 */
export function parse(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new UsageError(`unexpected argument: ${arg}`);
    }
    // Split at the first `=` by index rather than by regex: the workspace targets es2015, where
    // the dotAll flag a `/=(.*)/s` split would need is not available.
    const body = arg.slice(2);
    const equals = body.indexOf('=');
    const name = equals === -1 ? body : body.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : body.slice(equals + 1);

    if ((BOOLEAN_FLAGS as readonly string[]).includes(name)) {
      if (inlineValue !== undefined) {
        throw new UsageError(`--${name} takes no value`);
      }
      flags.add(name);
      continue;
    }
    if (!(VALUE_FLAGS as readonly string[]).includes(name)) {
      throw new UsageError(`unknown option: --${name}`);
    }

    const value = inlineValue ?? argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`--${name} needs a value`);
    }
    if (inlineValue === undefined) {
      i += 1;
    }
    values.set(name, value);
  }

  return {
    target: resolve(values.get('target') ?? process.cwd()),
    source: values.get('source') ?? null,
    ref: values.get('ref') ?? null,
    acceptLocalSource: flags.has('accept-local-source'),
    apply: flags.has('apply'),
    setup: flags.has('setup'),
    json: flags.has('json'),
  };
}

function groupByTopLevel(files: readonly string[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const file of files) {
    const root = file.split('/')[0];
    groups[root] = (groups[root] ?? 0) + 1;
  }
  return groups;
}

function reportRefusal(refusal: Refusal, options: Options, io: Io): number {
  if (options.json) {
    const next = nextCommand(refusal);
    io.out(
      `${JSON.stringify({
        refused: refusal.condition,
        message: describe(refusal),
        ...('path' in refusal ? { path: refusal.path } : {}),
        ...(next ? { next } : {}),
      })}\n`,
    );
  } else {
    io.err(`${describe(refusal)}\n`);
  }
  return 1;
}

/**
 * Turn a route into a candidate tree on disk, plus what the run should report about how it got
 * there. The route's adapters do the I/O; core decides.
 */
function locate(route: Route): { root: string; provenance: Provenance } {
  if (route.kind === 'local') {
    const root = resolve(route.path);

    // A path git cannot read as a repository is not a harness source, because the declared set is
    // drawn from the source's index — so there is no universe to intersect.
    let facts;
    try {
      facts = readLocalFacts(root);
    } catch {
      throw new SourceRefused({
        condition: 'source-not-a-harness',
        path: route.path,
      });
    }

    return {
      root,
      provenance: {
        route: 'local',
        source: route.path,
        cache: null,
        // A WARNING rather than a refusal. Whether a local tree is reproducible is a judgement
        // about provenance quality, and refusing on it was a policy this installer chose rather
        // than anything the job requires — three refusal conditions and a core module to decline a
        // placement the caller explicitly asked for. Saying so and proceeding is the smaller act.
        unreproducible: facts.dirty || !facts.hasUpstream || facts.aheadBy > 0,
      },
    };
  }

  try {
    const fetched = fetchSource({ ref: route.ref });
    return {
      root: fetched.root,
      provenance: {
        route: 'fetch',
        source: PINNED_REPOSITORY,
        cache: fetched.cache,
        unreproducible: false,
      },
    };
  } catch (error) {
    // A redirect is already a refusal with its own condition and message; falling through would
    // turn it into a generic fetch failure carrying a bare slug.
    if (error instanceof FetchRedirected) {
      throw new SourceRefused(error.refusal);
    }
    const detail =
      error instanceof GitError
        ? diagnose(error.failure)
        : redact(String(error instanceof Error ? error.message : error));
    throw new SourceRefused({ condition: 'fetch-failed', detail });
  }
}

function resolveRoute(options: Options): Route {
  const chosen = chooseRoute(options);
  if ('usageError' in chosen) {
    throw new UsageError(chosen.usageError);
  }
  return chosen.route;
}

/**
 * Launch the harness's own configuration step, in a session rooted in the target.
 *
 * The handoff exists because a bootstrap session cannot run harness skills — they resolve against
 * the new project's configuration and hooks, which bind only to a session started there. But a CLI
 * can START such a session: the constraint is that a session cannot re-root itself, not that a
 * process cannot spawn one with a different working directory.
 *
 * INTERACTIVE, and opt-in for that reason. The configuration step asks for profile, mode, variant
 * and more, and the harness's own script refuses rather than guessing a workspace layout — so a
 * non-interactive run would make an agent invent answers that gates then enforce. A CLI that blocks
 * on an interactive session is also wrong in CI and wrong when an agent runs it, which is why the
 * default remains printing the handoff.
 */
function launchSetup(target: string, step: string, io: Io): number | null {
  // null means DECLINED, and the caller then prints the handoff. Returning 0 instead announced a
  // fallback it did not perform: the message said "printing the handoff instead" and the handoff
  // was never printed, because success and decline were the same value.
  if (!process.stdout.isTTY) {
    io.err(
      '--setup starts an interactive session and stdout is not a terminal, so it would hang.\n' +
        'Printing the handoff instead.\n',
    );
    return null;
  }
  const result = spawnSync('claude', [`/${step}`], {
    cwd: target,
    stdio: 'inherit',
  });
  if (result.error) {
    io.err(
      `--setup could not start the agent (${result.error.message}). ` +
        'Printing the handoff instead.\n',
    );
    return null;
  }
  return result.status ?? 0;
}

async function init(options: Options, io: Io): Promise<number> {
  const route = resolveRoute(options);

  let source;
  let provenance: Provenance;
  try {
    const located = locate(route);
    provenance = located.provenance;
    source = await resolveSource(located.root);
  } catch (error) {
    if (error instanceof SourceRefused) {
      return reportRefusal(error.refusal, options, io);
    }
    throw error;
  }

  const files = declaredSet(trackedPaths(source.root), source.travels);

  const targetRefusal = assessTarget({
    target: options.target,
    carriesHarness: existsSync(resolve(options.target, HARNESS_DIRECTORY)),
    collisions: collisions(options.target, files),
  });
  if (targetRefusal) {
    // Re-running reprints the handoff, which is what makes a closed session recoverable.
    // Additional to the refusal, not instead: the target does already carry the harness.
    if (targetRefusal.condition === 'target-carries-harness' && !options.json) {
      io.out(buildHandoff(options.target, source.declaredSteps).text);
    }
    return reportRefusal(targetRefusal, options, io);
  }

  const request = {
    sourceRoot: source.root,
    target: options.target,
    files,
    acceptLocalModifications: options.acceptLocalSource,
  };
  const escaping = unconfined(request);
  if (escaping) {
    return reportRefusal(escaping, options, io);
  }

  // Refused before anything is written: replacing a hook path would disable whatever check the
  // team already had, and a refusal must leave an untouched target.
  const hooks = checkHooksPath(options.target);
  if (hooks) {
    return reportRefusal(hooks, options, io);
  }

  let written: number;
  try {
    written = place(request);
  } catch (error) {
    // Exit 3: preconditions passed, writing began, and it stopped part-way. Distinct from a
    // refusal precisely because 1 promises an untouched target and this cannot.
    io.err(
      `Placement stopped part-way into ${options.target}: ` +
        `${redact(error instanceof Error ? error.message : String(error))}\n` +
        'The target holds some of the harness. Remove it before retrying.\n',
    );
    return 3;
  }

  const wired = wire(options.target);
  writeProvenance(options.target, {
    repository: PINNED_REPOSITORY,
    ref: options.ref,
    commit: source.commit,
    installer: `@abgov/keystone@${installerVersion()}`,
  });
  pinInstaller(options.target, installerVersion());

  const handoff = buildHandoff(options.target, source.declaredSteps);

  if (options.json) {
    io.out(
      `${JSON.stringify({
        placed: true,
        route: provenance.route,
        source: provenance.source,
        ref: options.ref,
        commit: source.commit,
        ...(provenance.cache ? { cache: provenance.cache } : {}),
        unreproducibleSource: provenance.unreproducible,
        floor: wired.floor,
        written,
        files,
      })}\n`,
    );
    return 0;
  }

  const cacheLine = provenance.cache ? `\n  cache: ${provenance.cache}` : '';
  io.out(
    `Placed ${written} files into ${options.target}\n` +
      `  from ${provenance.source} at ${source.commit}${cacheLine}\n` +
      `  floor: ${wired.floor === 'deferred' ? 'applied by @abgov/nx-agent:init' : 'hook path wired'}\n` +
      `  ${Object.entries(groupByTopLevel(files))
        .map(([root, count]) => `${root} ${count}`)
        .join(', ')}\n`,
  );
  if (provenance.unreproducible) {
    io.err(
      `Note: ${provenance.source} has uncommitted or unpushed work, so the commit recorded for\n` +
        'this project may not be one anyone else can fetch.\n',
    );
  }

  if (options.setup && handoff.kind === 'step') {
    const launched = launchSetup(options.target, handoff.step, io);
    if (launched !== null) {
      return launched;
    }
  }
  io.out(`\n${handoff.text}`);
  return 0;
}

/**
 * Hand an existing copy to the harness's own tool.
 *
 * What this adds over running that tool directly is not the spawn — it is OBTAINING the source.
 * The harness's own remediation states the precondition: the tool runs in the source and names the
 * target, so a project that only has a placed copy cannot run it at all.
 */
async function upgrade(options: Options, io: Io): Promise<number> {
  const route = resolveRoute(options);

  if (!existsSync(resolve(options.target, HARNESS_DIRECTORY))) {
    return reportRefusal(
      { condition: 'target-carries-no-harness', target: options.target },
      options,
      io,
    );
  }

  let source;
  try {
    source = await resolveSource(locate(route).root);
  } catch (error) {
    if (error instanceof SourceRefused) {
      return reportRefusal(error.refusal, options, io);
    }
    throw error;
  }

  if (!hasUpgradeTool(source)) {
    return reportRefusal(
      { condition: 'source-exports-no-predicate', commit: source.commit },
      options,
      io,
    );
  }

  const outcome = runUpgradeTool(source, options.target, {
    apply: options.apply,
    json: options.json,
  });
  if (outcome.status !== 0) {
    return reportRefusal(
      { condition: 'upgrade-refused', detail: outcome.output },
      options,
      io,
    );
  }

  io.out(`${outcome.output}\n`);

  // The one thing this package writes during an upgrade, and a deliberate carve-out: the record is
  // its own artifact, not harness content. Only when the tool actually applied — a plan changes
  // nothing, so the recorded provenance must still describe what is there.
  if (options.apply) {
    writeProvenance(options.target, {
      repository: PINNED_REPOSITORY,
      ref: options.ref,
      commit: source.commit,
      installer: `@abgov/keystone@${installerVersion()}`,
    });
  }
  return 0;
}

const USAGE =
  'usage: keystone <init|upgrade> [--target <dir>] [--ref <tag|branch|sha>] [--source <path>]\n' +
  '                               [--accept-local-source] [--setup] [--apply] [--json]';

/** Runs one invocation and returns its exit status. Never throws for a usage or refusal case. */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  const command = argv[0];
  if (command !== 'init' && command !== 'upgrade') {
    io.err(`${USAGE}\n`);
    return 2;
  }

  let options: Options;
  try {
    options = parse(argv.slice(1));
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`keystone ${command}: ${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }

  try {
    return command === 'init'
      ? await init(options, io)
      : await upgrade(options, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`keystone ${command}: ${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
}
