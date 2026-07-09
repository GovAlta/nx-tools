import {
  generateFiles,
  getWorkspaceLayout,
  readProjectConfiguration,
  Tree,
  updateJson,
} from '@nx/devkit';
import * as path from 'path';

interface EslintRc {
  overrides?: { files?: string[]; rules?: Record<string, string> }[];
}

// Turns off vue/no-deprecated-slot-attribute for the lib. GoabModal projects into
// goa-modal's native web-component slot via `slot="actions"` — legitimate custom-
// element usage, not the deprecated Vue 2 component-slot syntax the rule targets.
// The whole lib wraps web components, so it's scoped to the lib (consuming apps,
// which use `<template #actions>`, are unaffected).
function disableSlotAttributeRule(host: Tree, libRoot: string): void {
  const eslintrc = `${libRoot}/.eslintrc.json`;
  if (!host.exists(eslintrc)) {
    console.warn(
      `\n⚠  ${eslintrc} not found — could not disable vue/no-deprecated-slot-attribute.\n` +
      `   GoabModal uses goa-modal's native \`slot\` attribute; if lint flags it, turn\n` +
      `   that rule off for this library.\n`
    );
    return;
  }
  updateJson<EslintRc, EslintRc>(host, eslintrc, (json) => {
    const overrides = (json.overrides ??= []);
    let vueOverride = overrides.find((o) => o.files?.some((f) => f.includes('vue')));
    if (!vueOverride) {
      vueOverride = { files: ['*.vue'], rules: {} };
      overrides.push(vueOverride);
    }
    (vueOverride.rules ??= {})['vue/no-deprecated-slot-attribute'] = 'off';
    return json;
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
  }

  generateFiles(host, path.join(__dirname, 'files'), libRoot, { tmpl: '' });
}
