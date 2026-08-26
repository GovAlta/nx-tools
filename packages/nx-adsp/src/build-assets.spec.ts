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
      fs.readFileSync(path.join(projectRoot, 'project.json'), 'utf-8'),
    );
    const assets: unknown[] = project.targets.build.options.assets ?? [];

    // Globs whose input is this package's src directory.
    const srcGlobs = assets
      .filter(
        (a): a is { input: string; glob: string } =>
          typeof a === 'object' &&
          a !== null &&
          'input' in a &&
          path.resolve(repoRoot, (a as { input: string }).input) === srcRoot,
      )
      .map((a) => a.glob);

    // Every non-source file under src must ship (tsc only emits .ts -> .js).
    const mustShip = listFiles(srcRoot)
      .filter((f) => !/\.tsx?$/.test(f))
      .map((f) => path.relative(srcRoot, f));

    const unmatched = mustShip.filter(
      (rel) => !srcGlobs.some((glob) => minimatch(rel, glob, { dot: true })),
    );

    expect(unmatched).toEqual([]);
  });

  // The same boundary one level up. A migration is only reachable if
  // package.json declares the registry and project.json ships it — and the
  // migration's own unit tests resolve everything from the source tree, so they
  // pass either way. Nothing else catches a migration that publishes inert.
  it('ships the migrations registry declared in package.json', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
    );
    const registry: string | undefined = pkg['nx-migrations']?.migrations;
    expect(registry).toBeDefined();

    const registryPath = path.join(projectRoot, registry as string);
    expect(fs.existsSync(registryPath)).toBe(true);

    const project = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'project.json'), 'utf-8'),
    );
    const assets: unknown[] = project.targets.build.options.assets ?? [];
    const rootGlobs = assets
      .filter(
        (a): a is { input: string; glob: string } =>
          typeof a === 'object' &&
          a !== null &&
          'input' in a &&
          path.resolve(repoRoot, (a as { input: string }).input) ===
            path.resolve(projectRoot),
      )
      .map((a) => a.glob);

    const rel = path.relative(projectRoot, registryPath);
    expect(rootGlobs.some((glob) => minimatch(rel, glob, { dot: true }))).toBe(
      true,
    );
  });

  // Every file a migration names must resolve, or `nx migrate` fails at run
  // time in the consumer's workspace rather than here. `prompt` is the markdown
  // handed to the paired AI step; Nx resolves it relative to migrations.json
  // (not through package exports), and requires at least one of implementation,
  // factory, or prompt per entry.
  it('points every migration at files that exist', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'migrations.json'), 'utf-8'),
    );
    const entries: [
      string,
      { implementation?: string; factory?: string; prompt?: string },
    ][] = Object.entries(registry.generators ?? {});
    expect(entries.length).toBeGreaterThan(0);

    const problems: string[] = [];
    for (const [name, entry] of entries) {
      if (!entry.implementation && !entry.factory && !entry.prompt) {
        problems.push(`${name}: needs implementation, factory, or prompt`);
      }
      if (
        entry.implementation &&
        !fs.existsSync(path.join(projectRoot, `${entry.implementation}.ts`))
      ) {
        problems.push(`${name}: implementation not found`);
      }
      // Referenced verbatim, extension included — unlike implementation, which
      // Nx resolves without one.
      if (
        entry.prompt &&
        !fs.existsSync(path.join(projectRoot, entry.prompt))
      ) {
        problems.push(`${name}: prompt not found`);
      }
    }

    expect(problems).toEqual([]);
  });
});
