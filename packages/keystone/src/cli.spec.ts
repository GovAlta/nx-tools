// project-docs-ancestors: cli-designs:keystone-init

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Io, parse, run, UsageError } from './cli';
import { makeSource, makeTarget, remoteOf } from './testing/fixture';

// The command's own contract: the option surface, the exit status, and the payloads. The design
// states that the literal refusal strings are asserted by a test, and until this file existed none
// of them were — four of six were never checked at all.

jest.setTimeout(120000);

function capture(): Io & { stdout: string; stderr: string } {
  const io = {
    stdout: '',
    stderr: '',
    out: (text: string) => {
      io.stdout += text;
    },
    err: (text: string) => {
      io.stderr += text;
    },
  };
  return io;
}

describe('parse', () => {
  // Verified by review as a real defect: only the space-separated form was matched, and unknown
  // arguments were discarded silently — so `--target=/path` placed into the working directory. The
  // design's own words: a placement into the wrong directory is not undoable by this command.
  it('accepts the --target=<dir> form as well as --target <dir>', () => {
    expect(parse(['--target=/tmp/one', '--source=/tmp/src']).target).toBe(
      '/tmp/one',
    );
    expect(parse(['--target', '/tmp/two', '--source', '/tmp/src']).target).toBe(
      '/tmp/two',
    );
  });

  it('refuses an unknown option rather than ignoring it', () => {
    expect(() => parse(['--tarrget', '/tmp/one'])).toThrow(UsageError);
  });

  it('refuses a value flag given no value', () => {
    expect(() => parse(['--target', '--json'])).toThrow(UsageError);
    expect(() => parse(['--target'])).toThrow(UsageError);
  });

  it('refuses a bare argument', () => {
    expect(() => parse(['/tmp/one'])).toThrow(UsageError);
  });

  it('refuses a value on a boolean flag', () => {
    expect(() => parse(['--plan=yes'])).toThrow(UsageError);
  });

  it('carries --ref through, and defaults it to null', () => {
    expect(parse(['--ref', 'v1.0.0']).ref).toBe('v1.0.0');
    expect(parse(['--ref=v1.0.0']).ref).toBe('v1.0.0');
    expect(parse([]).ref).toBeNull();
  });

  it('carries --accept-local-source through as a boolean', () => {
    expect(parse(['--accept-local-source']).acceptLocalSource).toBe(true);
    expect(parse([]).acceptLocalSource).toBe(false);
  });
});

describe('keystone init', () => {
  it('places for real, and the payload says so', async () => {
    const source = makeSource();
    const target = makeTarget();
    const io = capture();

    const status = await run(
      ['init', '--target', target, '--source', source, '--json'],
      io,
    );

    expect(status).toBe(0);
    const payload = JSON.parse(io.stdout);
    expect(payload.placed).toBe(true);
    expect(payload.written).toBe(payload.files.length);
    expect(existsSync(join(target, 'AGENTS.md'))).toBe(true);
  });

  it('refuses a target that already carries the harness, naming upgrade', async () => {
    const source = makeSource();
    const target = makeTarget();
    await run(['init', '--target', target, '--source', source], capture());
    const io = capture();

    const status = await run(
      ['init', '--target', target, '--source', source, '--json'],
      io,
    );

    expect(status).toBe(1);
    expect(JSON.parse(io.stdout)).toEqual({
      refused: 'target-carries-harness',
      message: `${target} already carries the harness. To update it, run: keystone upgrade --target ${target}`,
      next: `keystone upgrade --target ${target}`,
    });
  });

  // The literal strings the design specifies, four of which nothing asserted before this file.
  it('refuses a directory that is not a harness source, with the specified text', async () => {
    const target = makeTarget();
    const notASource = makeTarget();
    const io = capture();

    const status = await run(
      ['init', '--target', target, '--source', notASource, '--json'],
      io,
    );

    expect(status).toBe(1);
    expect(JSON.parse(io.stdout)).toEqual({
      refused: 'source-not-a-harness',
      message: `${notASource} carries no harness manifest, so it is not a harness source.`,
      path: notASource,
    });
  });

  it('refuses a source declaring another repository, with the specified text', async () => {
    const source = makeSource({ repo: 'someone-else/not-the-harness' });
    const io = capture();

    const status = await run(
      ['init', '--target', makeTarget(), '--source', source, '--json'],
      io,
    );

    expect(status).toBe(1);
    expect(JSON.parse(io.stdout).message).toBe(
      'The source declares itself to be someone-else/not-the-harness, not GovAlta-EMU/keystone. ' +
        'Placement reads only the pinned harness repository.',
    );
  });

  it('refuses a source declaring no distribution set, naming its own version', async () => {
    const source = makeSource({ withDistribution: false });
    const io = capture();

    const status = await run(
      ['init', '--target', makeTarget(), '--source', source, '--json'],
      io,
    );

    expect(status).toBe(1);
    expect(JSON.parse(io.stdout).message).toMatch(
      /declares no distribution set \(version 9\.9\.9\), so there is nothing to place from it\.$/,
    );
  });

  it('reports a refusal on stderr when --json was not asked for', async () => {
    const io = capture();

    await run(['init', '--target', makeTarget(), '--source', makeTarget()], io);

    expect(io.stdout).toBe('');
    expect(io.stderr).toMatch(/carries no harness manifest/);
  });

  // req-006 rule 2, made observable: the payload reports the route, so a run claiming the local
  // route while contacting a remote is a contradiction a test can catch.
  it('reports the route it took, and no cache on the local route', async () => {
    const io = capture();

    await run(
      ['init', '--target', makeTarget(), '--source', makeSource(), '--json'],
      io,
    );

    const payload = JSON.parse(io.stdout);
    expect(payload.route).toBe('local');
    expect(payload.cache).toBeUndefined();
    expect(payload.unreproducibleSource).toBe(false);
  });

  // A WARNING, not a refusal. Refusing on a local tree's own state was a policy this installer
  // chose rather than anything the job requires; the placement the caller asked for proceeds and
  // the provenance quality is reported.
  it('warns about an unreproducible local source rather than refusing it', async () => {
    const source = makeSource();
    writeFileSync(join(source, 'AGENTS.md'), '# edited, uncommitted\n');
    const io = capture();

    const status = await run(
      ['init', '--target', makeTarget(), '--source', source, '--json'],
      io,
    );

    expect(status).toBe(0);
    expect(JSON.parse(io.stdout).unreproducibleSource).toBe(true);
  });

  // The bug this exists for: FetchRedirected fell through to the generic branch, so the code an
  // agent parses was "fetch-failed" and the message was the bare slug "fetch-remote-redirected".
  // The condition's entire rendered message was unreachable.
  it('surfaces a redirect as its own condition, with its real message', async () => {
    const target = makeTarget();
    const elsewhere = remoteOf(makeSource());
    const io = capture();

    // A machine-wide rewrite, via the env var git reads as global config.
    const globalConfig = join(makeTarget(), 'gitconfig');
    writeFileSync(
      globalConfig,
      `[url "${elsewhere}"]\n\tinsteadOf = https://github.com/GovAlta-EMU/\n`,
    );
    const previous = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = globalConfig;

    try {
      const status = await run(['init', '--target', target, '--json'], io);

      expect(status).toBe(1);
      const payload = JSON.parse(io.stdout);
      expect(payload.refused).toBe('fetch-remote-redirected');
      expect(payload.message).toMatch(/rewrites the harness source URL/);
      expect(payload.message).toMatch(
        /does not designate GovAlta-EMU\/keystone/,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = previous;
      }
    }
  });

  // req-006 rule 3 through placement: a tracked file deleted locally is a local modification, so
  // the flag has to get past the refusal for it as well.
  it('lets --accept-local-source past a tracked file the source no longer holds', async () => {
    const source = makeSource();
    rmSync(join(source, 'AGENTS.md'));
    const io = capture();

    const refused = await run(
      ['init', '--target', makeTarget(), '--source', source, '--json'],
      io,
    );
    expect(refused).toBe(1);
    expect(JSON.parse(io.stdout).refused).toBe('source-missing-declared-path');

    const accepted = capture();
    const status = await run(
      [
        'init',
        '--target',
        makeTarget(),
        '--source',
        source,
        '--accept-local-source',
        '--json',
      ],
      accepted,
    );

    expect(status).toBe(0);
    const payload = JSON.parse(accepted.stdout);
    // The deleted file is in the declared set but was not written, and that is not a silent drop:
    // it is only skipped because the caller accepted local modifications.
    expect(payload.files).toContain('AGENTS.md');
    expect(payload.written).toBe(payload.files.length - 1);
  });

  // The whole point of the command, asserted end to end: a placed project that is actually usable.
  // The headline defect of the hand-written installer was an inert pre-commit hook — present,
  // executable, and never run, because core.hooksPath was never set.
  it('leaves a usable project: a repository, a live hook path, provenance and a handoff', async () => {
    const target = makeTarget();
    const io = capture();

    const status = await run(
      ['init', '--target', target, '--source', makeSource()],
      io,
    );

    expect(status).toBe(0);
    expect(existsSync(join(target, '.git'))).toBe(true);
    expect(
      execFileSync('git', ['-C', target, 'config', '--get', 'core.hooksPath'], {
        encoding: 'utf-8',
      }).trim(),
    ).toBe('.husky');

    const record = JSON.parse(
      readFileSync(join(target, '.keystone/install.json'), 'utf-8'),
    );
    // An identity, never a path: recording the caller's own path put a machine-local absolute path
    // into a file the project commits — the defect this package exists to remove.
    expect(record.repository).toBe('GovAlta-EMU/keystone');
    expect(JSON.stringify(record)).not.toMatch(/\/(Users|home)\//);

    // The file the project's own configuration step owns is left for it to write.
    expect(existsSync(join(target, '.keystone/project.json'))).toBe(false);

    expect(io.stdout).toMatch(/Open a new session rooted in/);
    expect(io.stdout).toContain('/setup');
    // Without this the command init's own refusal names cannot run: the harness's upgrade tool
    // refuses a dirty tree, and every placed file is untracked until committed.
    expect(io.stdout).toMatch(/Commit this placement/);
  });

  // req-010 rule 4, at the command level: a source that declares no step this installer
  // recognises gets a handoff saying so, never a guessed or empty command name.
  it('says so rather than naming a command when the source declares no step', async () => {
    const io = capture();

    await run(
      [
        'init',
        '--target',
        makeTarget(),
        '--source',
        makeSource({ withSkills: false }),
      ],
      io,
    );

    expect(io.stdout).toMatch(/declares no configuration step/);
    expect(io.stdout).not.toContain('/setup');
  });

  // req-010 rule 5: a closed session is recoverable by asking again.
  it('reprints the handoff when re-run, while still refusing and naming the update path', async () => {
    const target = makeTarget();
    const source = makeSource();
    await run(['init', '--target', target, '--source', source], capture());
    const io = capture();

    const status = await run(
      ['init', '--target', target, '--source', source],
      io,
    );

    expect(status).toBe(1);
    expect(io.stdout).toMatch(/Open a new session rooted in/);
    expect(io.stderr).toMatch(/keystone upgrade/);
  });

  // req-007 rule 4. And the reason this matters beyond the rule: init's own refusal already tells
  // a caller to run `keystone upgrade`, so until the command existed the installer named a command
  // it did not have — the defect class its own handoff guard exists to prevent.
  it('refuses to upgrade a target that carries no harness, naming init', async () => {
    const target = makeTarget();
    const io = capture();

    const status = await run(['upgrade', '--target', target, '--json'], io);

    expect(status).toBe(1);
    const payload = JSON.parse(io.stdout);
    expect(payload.refused).toBe('target-carries-no-harness');
    expect(payload.message).toContain(`keystone init --target ${target}`);
  });

  it('honours the command init pointed the caller at', async () => {
    const target = makeTarget();
    const source = makeSource();
    await run(['init', '--target', target, '--source', source], capture());
    const io = capture();

    // The fixture source carries no upgrade tool, so this refuses on that rather than on the
    // target — which is itself the point: the target check passed.
    const status = await run(
      ['upgrade', '--target', target, '--source', source, '--json'],
      io,
    );

    expect(status).toBe(1);
    expect(JSON.parse(io.stdout).refused).not.toBe('target-carries-no-harness');
  });

  // --setup starts an interactive session, so it must decline where one cannot work rather than
  // hang. jest runs with stdout not a TTY, which is exactly the CI/agent case.
  it('declines to launch a session where stdout is not a terminal, and prints the handoff', async () => {
    const io = capture();

    const status = await run(
      ['init', '--target', makeTarget(), '--source', makeSource(), '--setup'],
      io,
    );

    expect(status).toBe(0);
    expect(io.stderr).toMatch(/not a terminal/);
    expect(io.stdout).toMatch(/Open a new session rooted in/);
  });

  it('carries --setup through as a boolean', () => {
    expect(parse(['--setup']).setup).toBe(true);
    expect(parse([]).setup).toBe(false);
  });

  it('exits 2 on a usage error, distinct from a refusal', async () => {
    const io = capture();

    expect(await run(['init', '--tarrget', '/tmp/x'], io)).toBe(2);
    expect(await run(['place'], io)).toBe(2);
    expect(io.stderr).toMatch(/<init\|upgrade>/);
    expect(await run([], io)).toBe(2);
  });

  // req-006 rule 5: a ref selects among the pinned repository's commits, so pairing it with a
  // local tree is two explicit instructions that cannot both be honoured.
  it('exits 2 when --ref is paired with --source', async () => {
    const io = capture();

    const status = await run(
      [
        'init',
        '--target',
        makeTarget(),
        '--source',
        makeSource(),
        '--ref',
        'v1.0.0',
      ],
      io,
    );

    expect(status).toBe(2);
    expect(io.stderr).toMatch(/does not apply to a local source/);
  });
});
