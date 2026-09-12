// project-docs-ancestors: cli-designs:keystone-init

import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { declaredSet } from '../core/rules';
import { git, makeSource, makeTarget } from '../testing/fixture';
import { collisions, place, unconfined } from './place';
import {
  resolveSource,
  SOURCE_LAYOUT,
  SourceRefused,
  trackedPaths,
} from './source';

// A REAL run against a real fixture tree on disk, not a mocked one. The whole point of this
// requirement is what reaches a target directory, so the thing under test is the filesystem
// afterwards. Nothing here stubs git, the predicate module, or the writer.

jest.setTimeout(120000);

describe('placement, against a real fixture tree', () => {
  it('places exactly the declared set, and nothing the source ignores or never tracked', async () => {
    const source = await resolveSource(makeSource());
    const target = makeTarget();
    const files = declaredSet(trackedPaths(source.root), source.travels);

    expect(unconfined({ sourceRoot: source.root, target, files })).toBeNull();
    place({ sourceRoot: source.root, target, files });

    // req-005 rule 2: the excluded directory's own content stays behind, the named exception travels.
    expect(existsSync(join(target, '.claude/refs/donor/example.md'))).toBe(
      true,
    );
    expect(existsSync(join(target, '.claude/refs/history.md'))).toBe(false);

    // req-005 rule 1: ignored and untracked content cannot travel, with no ignore list of our own.
    expect(
      existsSync(join(target, 'template/app/node_modules/dep/index.js')),
    ).toBe(false);
    expect(existsSync(join(target, 'generated.html'))).toBe(false);
    expect(existsSync(join(target, 'AGENTS.untracked.md'))).toBe(false);

    expect(readFileSync(join(target, 'AGENTS.md'), 'utf-8')).toBe(
      '# fixture agents\n',
    );
    expect(existsSync(join(target, 'template/app/index.ts'))).toBe(true);
  });

  // req-005 rule 4: a placed hook is executable, or it fails silently at the moment it matters.
  it('places the hook executable, and bounds the mode', async () => {
    const source = await resolveSource(makeSource());
    const target = makeTarget();
    const files = declaredSet(trackedPaths(source.root), source.travels);

    place({ sourceRoot: source.root, target, files });

    const hook = statSync(join(target, '.husky/pre-commit')).mode & 0o7777;
    expect(hook).toBe(0o755);
    expect(statSync(join(target, 'AGENTS.md')).mode & 0o7777).toBe(0o644);
  });

  // req-005 rule 6: a file the installer did not place is not overwritten, and the collision is
  // reported by path.
  it('detects a collision with a file the target already had', async () => {
    const source = await resolveSource(makeSource());
    const target = makeTarget();
    writeFileSync(join(target, 'AGENTS.md'), "the project's own conventions\n");
    const files = declaredSet(trackedPaths(source.root), source.travels);

    expect(collisions(target, files)).toEqual(['AGENTS.md']);
    // The project's own file is still its own: nothing was written.
    expect(readFileSync(join(target, 'AGENTS.md'), 'utf-8')).toBe(
      "the project's own conventions\n",
    );
  });

  // req-005 rule 7. A tracked symlink is inside the universe the git index defines, and the write
  // reads THROUGH a link — so following one would copy content from outside the source into the
  // project. Refused outright rather than resolved.
  it('refuses a tracked symlink in the declared set', async () => {
    const sourceRoot = makeSource();
    symlinkSync('/etc/passwd', join(sourceRoot, 'escape.md'));
    git(sourceRoot, ['add', 'escape.md']);
    git(sourceRoot, ['commit', '-qm', 'symlink']);
    const target = makeTarget();

    expect(unconfined({ sourceRoot, target, files: ['escape.md'] })).toEqual({
      condition: 'source-declares-a-symlink',
      path: 'escape.md',
    });
  });

  // B1 from review, verified by execution: existsSync is false for a DANGLING symlink, so a
  // target holding `AGENTS.md -> /outside/x` reported no collision, and the copy then followed the
  // link and wrote outside the target.
  it('treats a dangling symlink in the target as a collision, not as absence', async () => {
    const source = await resolveSource(makeSource());
    const target = makeTarget();
    symlinkSync(
      join(tmpdir(), 'keystone-absent-destination'),
      join(target, 'AGENTS.md'),
    );
    const files = declaredSet(trackedPaths(source.root), source.travels);

    expect(collisions(target, files)).toEqual(['AGENTS.md']);
  });

  // B2 from review, verified by execution: confinement was lexical, so an existing symlinked
  // directory in the target carried the write outside it.
  it('refuses when an existing symlinked directory in the target leads outside it', async () => {
    const source = await resolveSource(makeSource());
    const target = makeTarget();
    const elsewhere = mkdtempSync(join(tmpdir(), 'keystone-elsewhere-'));
    symlinkSync(elsewhere, join(target, 'template'));

    const refusal = unconfined({
      sourceRoot: source.root,
      target,
      files: ['template/app/index.ts'],
    });

    expect(refusal).toEqual({
      condition: 'path-escapes-target',
      target,
      path: 'template/app/index.ts',
    });
  });

  // B4 from review: an ancestor occupied by a regular file is discoverable up front, and left to
  // the write loop it surfaced as ENOTDIR with earlier files already placed.
  it('refuses when a declared path needs a directory the target has a file at', async () => {
    const source = await resolveSource(makeSource());
    const target = makeTarget();
    writeFileSync(
      join(target, 'template'),
      'a file where a directory must go\n',
    );

    const refusal = unconfined({
      sourceRoot: source.root,
      target,
      files: ['template/app/index.ts'],
    });

    expect(refusal).toMatchObject({ condition: 'target-file-collision' });
  });

  // B3 from review, measured: copyFileSync propagated the source mode, so a 0o6777 file landed
  // 0o777 for one syscall before being narrowed — on the hook that runs at every commit.
  it('never writes a file wider than its bound, even transiently', async () => {
    const sourceRoot = makeSource();
    chmodSync(join(sourceRoot, '.husky/pre-commit'), 0o6777);
    const source = await resolveSource(sourceRoot);
    const target = makeTarget();
    const files = declaredSet(trackedPaths(source.root), source.travels);

    place({ sourceRoot: source.root, target, files });

    expect(statSync(join(target, '.husky/pre-commit')).mode & 0o7777).toBe(
      0o755,
    );
  });

  it('refuses a source whose predicate module is absent', async () => {
    const sourceRoot = makeSource();
    rmSync(join(sourceRoot, SOURCE_LAYOUT.predicateModule));

    await expect(resolveSource(sourceRoot)).rejects.toMatchObject({
      refusal: { condition: 'source-exports-no-predicate' },
    });
  });

  it('refuses a source that declares itself to be another repository', async () => {
    const sourceRoot = makeSource({ repo: 'someone-else/not-the-harness' });

    await expect(resolveSource(sourceRoot)).rejects.toBeInstanceOf(
      SourceRefused,
    );
  });

  it('refuses a directory that is not a harness source at all', async () => {
    await expect(resolveSource(makeTarget())).rejects.toMatchObject({
      refusal: { condition: 'source-not-a-harness' },
    });
  });

  // req-005 rule 5: a source with no declaration is refused, naming the source's own version.
  it('refuses a source carrying no distribution declaration', async () => {
    const sourceRoot = makeSource({ withDistribution: false });

    await expect(resolveSource(sourceRoot)).rejects.toMatchObject({
      refusal: { condition: 'source-declares-no-set', version: '9.9.9' },
    });
  });
});
