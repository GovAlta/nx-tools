import {
  generateFiles,
  getWorkspaceLayout,
  readProjectConfiguration,
  Tree,
  updateJson,
} from '@nx/devkit';
import { addOverrideToLintConfig, isEslintConfigSupported, lintConfigHasOverride } from '@nx/eslint/internal';
import type { Linter } from 'eslint';
import * as path from 'path';

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
  updateJson<Record<string, unknown>, Record<string, unknown>>(host, pkgPath, (pkg) => {
    pkg.main ??= SRC;
    pkg.module ??= SRC;
    pkg.types ??= SRC;
    pkg.exports ??= {
      './package.json': './package.json',
      '.': { types: SRC, import: SRC, default: SRC },
    };
    return pkg;
  });
}

// Turns off vue/no-deprecated-slot-attribute for the lib. GoabModal projects into
// goa-modal's native web-component slot via `slot="actions"` — legitimate custom-
// element usage, not the deprecated Vue 2 component-slot syntax the rule targets.
// The whole lib wraps web components, so it's scoped to the lib (consuming apps,
// which use `<template #actions>`, are unaffected).
//
// Uses @nx/eslint's own override helpers rather than hand-editing a specific
// file format: create-nx-workspace's current default is flat config
// (eslint.config.mjs), which is a JS module exporting an array, not JSON — an
// earlier version of this function only handled legacy .eslintrc.json, so it
// silently no-op'd (just a console warning) on flat-config workspaces, and
// `nx lint vue-components` failed for real on unmodified generator output.
// addOverrideToLintConfig/lintConfigHasOverride detect flat vs legacy
// internally (via @nx/eslint's own useFlatConfig check) and edit whichever is
// actually in effect — AST-aware for flat config, not string splicing.
function disableSlotAttributeRule(host: Tree, libRoot: string): void {
  if (!isEslintConfigSupported(host, libRoot)) {
    console.warn(
      `\n⚠  No ESLint config found for ${libRoot} — could not disable vue/no-deprecated-slot-attribute.\n` +
      `   GoabModal uses goa-modal's native \`slot\` attribute; if lint flags it, turn\n` +
      `   that rule off for this library.\n`
    );
    return;
  }

  // `files` is `string | string[]` per the Linter type — normalize before checking.
  const isVueOverride = (o: Linter.ConfigOverride<Linter.RulesRecord>) =>
    (Array.isArray(o.files) ? o.files : o.files ? [o.files] : []).some((f) => f.includes('vue'));

  const alreadyDisabled = lintConfigHasOverride(
    host,
    libRoot,
    (o) => isVueOverride(o) && o.rules?.['vue/no-deprecated-slot-attribute'] === 'off'
  );
  if (alreadyDisabled) {
    return;
  }

  addOverrideToLintConfig(host, libRoot, {
    files: ['*.vue'],
    rules: { 'vue/no-deprecated-slot-attribute': 'off' },
  });
}

export const LIB_NAME = 'vue-components';

// Import specifier for the shared wrapper lib, derived from the workspace npm
// scope so it mirrors the eventual official `@abgov/vue-components` (same tail —
// swapping to it is a scope change). Falls back to a scope built from the root
// package name when the workspace isn't scoped.
export function vueComponentsImportPath(host: Tree): string {
  let name = 'workspace';
  try {
    name = JSON.parse(host.read('package.json')?.toString() ?? '{}').name || name;
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
        "The 'vue-components' generator requires the '@nx/vue' plugin. Install it and re-run:\n  npm i -D @nx/vue"
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
    disableSlotAttributeRule(host, libRoot);
    ensurePackageExports(host, libRoot);
  }

  generateFiles(host, path.join(__dirname, 'files'), libRoot, { tmpl: '' });
}
