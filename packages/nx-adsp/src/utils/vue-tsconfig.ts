import { Tree, updateJson } from '@nx/devkit';

// `moduleResolution` values that TypeScript only accepts alongside a
// bundler-compatible `module` (TS5095) and which additionally conflict with an
// inherited `module: nodenext` (TS5109).
const BUNDLER_RESOLUTIONS = ['bundler', 'Bundler'];

/**
 * Backfills a `module` setting on a generated Vue project's tsconfig when it
 * declares `moduleResolution: "bundler"` without one.
 *
 * @nx/vue's library and application generators write `moduleResolution:
 * "bundler"` into the project's tsconfig.json but leave `module` to be
 * inherited. In a create-nx-workspace TS-solution workspace the base sets
 * `module: "nodenext"`, and that pair is invalid two ways over:
 *
 *   error TS5095: Option 'bundler' can only be used when 'module' is set to
 *                 'preserve', 'commonjs', or 'es2015' or later.
 *   error TS5109: Option 'moduleResolution' must be set to 'NodeNext' (or left
 *                 unspecified) when option 'module' is set to 'NodeNext'.
 *
 * so `nx build` fails on completely unmodified generator output. `esnext`
 * matches what @nx/vue itself writes beside `bundler` in the app's
 * tsconfig.app.json, so this aligns the project with its own sibling config
 * rather than introducing a third convention.
 *
 * Deliberately conditional and idempotent: it only acts when
 * `moduleResolution` is bundler-flavoured *and* `module` is absent, so a
 * project whose tsconfig is already valid -- or which has been deliberately
 * pinned to something else -- is left alone.
 */
export function ensureBundlerModuleOption(
  host: Tree,
  tsconfigPath: string,
): void {
  if (!host.exists(tsconfigPath)) return;

  updateJson(host, tsconfigPath, (tsconfig) => {
    const compilerOptions = tsconfig.compilerOptions;
    if (!compilerOptions) return tsconfig;
    if (!BUNDLER_RESOLUTIONS.includes(compilerOptions.moduleResolution)) {
      return tsconfig;
    }
    if (compilerOptions.module) return tsconfig;

    compilerOptions.module = 'esnext';
    return tsconfig;
  });
}
