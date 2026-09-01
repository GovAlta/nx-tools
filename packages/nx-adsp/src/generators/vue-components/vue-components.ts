import {
  generateFiles,
  getWorkspaceLayout,
  readProjectConfiguration,
  Tree,
  updateJson,
} from '@nx/devkit';
import * as path from 'path';
import { disableSlotAttributeRule } from '../../utils/vue-eslint';
import { ensureBundlerModuleOption } from '../../utils/vue-tsconfig';

// Backfills package.json module-resolution fields for the library. In a TS-solution
// workspace @nx/vue's library resolves via package.json `exports`, but its
// programmatic default (useProjectJson skips writing them here) leaves them off, so
// the import path fails to resolve and the build breaks. Point them at the source
// entry (the lib is non-buildable — consumers compile it). A no-op in legacy
// path-alias workspaces (no lib package.json — resolution is via tsconfig paths),
// and idempotent (never clobbers fields @nx/vue did write).
export function ensurePackageExports(host: Tree, libRoot: string): void {
  const pkgPath = `${libRoot}/package.json`;
  if (!host.exists(pkgPath)) return;
  const SRC = './src/index.ts';
  updateJson<Record<string, unknown>, Record<string, unknown>>(
    host,
    pkgPath,
    (pkg) => {
      pkg.main ??= SRC;
      pkg.module ??= SRC;
      pkg.types ??= SRC;
      pkg.exports ??= {
        './package.json': './package.json',
        '.': { types: SRC, import: SRC, default: SRC },
      };
      return pkg;
    },
  );
}

export const LIB_NAME = 'vue-components';

// Import specifier for the shared wrapper lib, derived from the workspace npm
// scope so it mirrors the eventual official `@abgov/vue-components` (same tail —
// swapping to it is a scope change). Falls back to a scope built from the root
// package name when the workspace isn't scoped.
// Workspace-relative root of the shared wrapper lib, for docs that need to name a
// path rather than an import specifier. Reads the project graph first so it is
// correct in a TS-solution/flat workspace (where the lib sits at the root, not under
// libs/) and only falls back to the layout when the lib hasn't been generated yet.
export function vueComponentsLibRoot(host: Tree): string {
  try {
    return readProjectConfiguration(host, LIB_NAME).root;
  } catch {
    const { libsDir } = getWorkspaceLayout(host);
    return libsDir && libsDir !== '.' ? `${libsDir}/${LIB_NAME}` : LIB_NAME;
  }
}

export function vueComponentsImportPath(host: Tree): string {
  let name = 'workspace';
  try {
    name =
      JSON.parse(host.read('package.json')?.toString() ?? '{}').name || name;
  } catch {
    /* keep fallback */
  }
  const scope = name.startsWith('@') ? name.split('/')[0] : `@${name}`;
  return `${scope}/${LIB_NAME}`;
}

// Ensures the shared, workspace-local GoA wrapper library exists, then writes the
// current wrapper set into it. Idempotent: the @nx/vue library is only scaffolded
// when absent (so it's safe to call from every vue-app generation), and the
// wrapper files are always (re)written so a direct run also repairs/refreshes them.
export default async function (host: Tree) {
  const libRoot = `${getWorkspaceLayout(host).libsDir}/${LIB_NAME}`;

  let exists = true;
  try {
    readProjectConfiguration(host, LIB_NAME);
  } catch {
    exists = false;
  }

  if (!exists) {
    const { libraryGenerator } = await import('@nx/vue').catch(() => {
      throw new Error(
        "The 'vue-components' generator requires the '@nx/vue' plugin. Install it and re-run:\n  npm i -D @nx/vue",
      );
    });
    await libraryGenerator(host, {
      directory: libRoot,
      name: LIB_NAME,
      linter: 'eslint',
      unitTestRunner: 'vitest',
      // No demo component/spec to clean up, and no build step: apps consume the
      // source and compile it with their own vite (whose isCustomElement already
      // handles goa-*), so it resolves via the tsconfig path alias.
      component: false,
      bundler: 'none',
      importPath: vueComponentsImportPath(host),
      skipFormat: true,
    });
    disableSlotAttributeRule(
      host,
      libRoot,
      "GoabModal uses goa-modal's native `slot` attribute",
    );
    ensurePackageExports(host, libRoot);
    ensureBundlerModuleOption(host, `${libRoot}/tsconfig.json`);
  }

  generateFiles(host, path.join(__dirname, 'files'), libRoot, { tmpl: '' });
}
