import * as fs from 'fs';
import * as path from 'path';
// minimatch is always present (nx depends on it); used only in this test.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import minimatch = require('minimatch');

/**
 * Guards the source -> published-package boundary.
 *
 * The build copies non-source files (generator templates, schemas, static
 * assets) into the package via the build target's `assets` globs. Any such file
 * NOT matched by a glob is silently dropped from the published package, so a
 * consumer's generate produces output referencing a file that was never
 * shipped. This is exactly how `Dockerfile__tmpl__` was lost: the rename from
 * `Dockerfile.template` (dotted) to `Dockerfile__tmpl__` (dotless) stopped it
 * matching `**\/*.!(ts)`.
 *
 * Unit tests of the generators can't catch this — they resolve templates from
 * the source tree, never the packaged output. This asserts the invariant
 * directly: every non-TypeScript file under src is covered by an asset glob.
 */
describe('build assets packaging', () => {
  const srcRoot = __dirname;
  const projectRoot = path.join(srcRoot, '..');
  const repoRoot = path.join(projectRoot, '..', '..');

  function listFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    });
  }

  it('matches every non-TypeScript src file with an asset glob', () => {
    const project = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'project.json'), 'utf-8')
    );
    const assets: unknown[] = project.targets.build.options.assets ?? [];

    // Globs whose input is this package's src directory.
    const srcGlobs = assets
      .filter(
        (a): a is { input: string; glob: string } =>
          typeof a === 'object' &&
          a !== null &&
          'input' in a &&
          path.resolve(repoRoot, (a as { input: string }).input) === srcRoot
      )
      .map((a) => a.glob);

    // Every non-source file under src must ship (tsc only emits .ts -> .js).
    const mustShip = listFiles(srcRoot)
      .filter((f) => !/\.tsx?$/.test(f))
      .map((f) => path.relative(srcRoot, f));

    const unmatched = mustShip.filter(
      (rel) => !srcGlobs.some((glob) => minimatch(rel, glob, { dot: true }))
    );

    expect(unmatched).toEqual([]);
  });
});
