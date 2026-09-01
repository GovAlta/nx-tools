import { Tree } from '@nx/devkit';
import {
  addOverrideToLintConfig,
  isEslintConfigSupported,
  lintConfigHasOverride,
} from '@nx/eslint/internal';
import type { Linter } from 'eslint';

// Turns off vue/no-deprecated-slot-attribute for a generated Vue project.
//
// Every project this plugin generates projects content into a goa-* web
// component's native slot via the `slot` attribute -- `slot="actions"` on
// goa-modal in the shared wrapper lib, `slot="header"`/`slot="footer"` on
// goa-one-column-layout in the app shell. That is legitimate custom-element
// usage, not the deprecated Vue 2 component-slot syntax the rule targets, and
// there is no alternative: Vue's `v-slot`/`#name` shorthand only addresses slots
// declared by a Vue component, never a custom element's.
//
// Shared rather than per-generator on purpose. This hazard was originally solved
// only inside the vue-components generator, so when the app shell later adopted
// goa-one-column-layout its `slot` attributes tripped the rule and `nx lint`
// failed on unmodified generator output. Any generator emitting a native slot
// attribute must call this, so keep it in one place.
//
// Uses @nx/eslint's own override helpers rather than hand-editing a specific file
// format: create-nx-workspace's current default is flat config
// (eslint.config.mjs), a JS module exporting an array rather than JSON.
// addOverrideToLintConfig/lintConfigHasOverride detect flat vs legacy internally
// (via @nx/eslint's own useFlatConfig check) and edit whichever is in effect --
// AST-aware for flat config, not string splicing.
export function disableSlotAttributeRule(
  host: Tree,
  projectRoot: string,
  reason: string,
): void {
  if (!isEslintConfigSupported(host, projectRoot)) {
    console.warn(
      `\n⚠  No ESLint config found for ${projectRoot} — could not disable vue/no-deprecated-slot-attribute.\n` +
        `   ${reason}; if lint flags it, turn that rule off for this project.\n`,
    );
    return;
  }

  // `files` is `string | string[]` per the Linter type — normalize before checking.
  const isVueOverride = (o: Linter.ConfigOverride<Linter.RulesRecord>) =>
    (Array.isArray(o.files) ? o.files : o.files ? [o.files] : []).some((f) =>
      f.includes('vue'),
    );

  const alreadyDisabled = lintConfigHasOverride(
    host,
    projectRoot,
    (o) =>
      isVueOverride(o) &&
      o.rules?.['vue/no-deprecated-slot-attribute'] === 'off',
  );
  if (alreadyDisabled) {
    return;
  }

  addOverrideToLintConfig(host, projectRoot, {
    files: ['*.vue'],
    rules: { 'vue/no-deprecated-slot-attribute': 'off' },
  });
}
