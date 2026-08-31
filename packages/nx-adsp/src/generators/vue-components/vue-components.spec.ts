import { readProjectConfiguration, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator, {
  ensurePackageExports,
  vueComponentsImportPath,
} from './vue-components';

jest.mock('@nx/devkit', () => ({
  ...jest.requireActual('@nx/devkit'),
  formatFiles: jest.fn().mockResolvedValue(undefined),
}));

describe('Vue Components Generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the shared wrapper library with all wrappers and a barrel', async () => {
    // Simulate a legacy-ESLint workspace so useFlatConfig() returns false and
    // the generator creates .eslintrc.json rather than eslint.config.mjs.
    host.write('.eslintrc.json', '{}');
    await generator(host);

    const config = readProjectConfiguration(host, 'vue-components');
    expect(config.root).toBe('libs/vue-components');

    const primitives = 'libs/vue-components/src/lib/primitives';
    for (const name of [
      'GoabInput',
      'GoabTextarea',
      'GoabDropdown',
      'GoabCheckbox',
      'GoabRadioGroup',
      'GoabButton',
      'GoabModal',
    ]) {
      expect(host.exists(`${primitives}/${name}.vue`)).toBeTruthy();
    }
    // Permanent app-shell pattern components live alongside the interim wrappers.
    const patterns = 'libs/vue-components/src/lib/patterns';
    for (const name of [
      'AppLayout',
      'AppHeader',
      'AppFooter',
      'AppSideMenu',
      'SessionExpiredBanner',
      'RecordDetailShell',
      'WorkspaceTable',
      'Stepper',
      'StepErrorSummary',
    ]) {
      expect(host.exists(`${patterns}/${name}.vue`)).toBeTruthy();
    }
    const index = host.read('libs/vue-components/src/index.ts').toString();
    expect(index).toContain('export { default as GoabInput }');
    expect(index).toContain('export { default as AppLayout }');
    expect(index).toContain('@abgov/vue-components'); // interim marker
    expect(index).toContain("from './lib/formatters'");
    expect(index).toContain('export { default as GoabDatePicker }');
    expect(index).toContain('export { default as FilterBar }');

    // GoabDatePicker is the one wrapper whose _change detail.value is a Date
    // rather than a string -- verified against the installed web-components,
    // where the dispatch reads `value: j.date, valueStr: r`.
    const datePicker = host
      .read('libs/vue-components/src/lib/primitives/GoabDatePicker.vue')
      .toString();
    expect(datePicker).toContain('defineModel<Date | undefined>()');
    expect(datePicker).toContain('CustomEvent<{ value: Date }>');

    // FilterBar stays presentational: it emits a query-ready values object and
    // never touches the page, the router, or the network.
    const filterBar = host
      .read('libs/vue-components/src/lib/patterns/FilterBar.vue')
      .toString();
    // goa-pagination registers all-lowercase prop names with no attribute:
    // alias, so kebab-case bindings silently never arrive and the control
    // renders "Page — of NaN".
    const table = host
      .read('libs/vue-components/src/lib/patterns/WorkspaceTable.vue')
      .toString();
    for (const prop of [':pagenumber=', ':itemcount=', ':perpagecount=']) {
      expect(table).toContain(prop);
    }
    for (const wrong of [':page-number=', ':item-count=', ':per-page-count=']) {
      expect(table).not.toContain(wrong);
    }

    // A bare YYYY-MM-DD is a calendar date, not an instant: parsing it through
    // `new Date(string)` yields UTC midnight, which in Alberta is the day before.
    const formattersSrc = host
      .read('libs/vue-components/src/lib/formatters.ts')
      .toString();
    // The staff shell must scroll its content, not the document -- otherwise
    // the persistent side menu scrolls off the top. Verified in a real browser;
    // this pins the rule so it can't regress to min-height.
    const sideMenu = host
      .read('libs/vue-components/src/lib/patterns/AppSideMenu.vue')
      .toString();
    expect(sideMenu).toContain('height: 100dvh');
    expect(sideMenu).toContain('overflow: hidden');
    expect(sideMenu).not.toContain('min-height: 100vh');

    // goa-form-stepper's `step` prop drives the progress bar; without it every
    // page of a wizard renders step one as current.
    const stepper = host
      .read('libs/vue-components/src/lib/patterns/Stepper.vue')
      .toString();
    expect(stepper).toContain(':step="currentStep"');
    expect(stepper).toContain('Math.min(Math.max(props.step, 1)');

    expect(formattersSrc).toContain('DATE_ONLY');
    expect(formattersSrc).toContain('local.getFullYear() === year');

    expect(filterBar).toContain('goa-filter-chip');
    expect(filterBar).toContain('goa-details');
    // Precise API forms, not bare words -- 'page' appears in the component's own
    // comment explaining that the *view* owns it.
    for (const forbidden of [
      'useRouter',
      'useRoute',
      'apiFetch',
      'fetch(',
      'page.value',
    ]) {
      expect(filterBar).not.toContain(forbidden);
    }
    // Local calendar parts, not UTC: in Alberta new Date('2026-08-28') is
    // 27 Aug 18:00 local, so a stored date would render as the day before.
    expect(filterBar).toContain('function toIsoDate');
    expect(filterBar).toContain('function fromIsoDate');
    // The call form, not the bare name: the component's own comments explain why
    // toISOString() is wrong, so the name legitimately appears in them.
    expect(filterBar).not.toContain('date.toISOString()');

    for (const spec of [
      'libs/vue-components/src/lib/patterns/FilterBar.spec.ts',
      'libs/vue-components/src/lib/primitives/GoabDatePicker.spec.ts',
      'libs/vue-components/src/lib/patterns/WorkspaceTable.spec.ts',
      'libs/vue-components/src/lib/patterns/Stepper.spec.ts',
    ]) {
      expect(host.exists(spec)).toBeTruthy();
    }

    // Shared value formatters: every view renders a date/count the same way
    // instead of inlining its own toLocaleString (which is what a real app did
    // in three separate views before this existed).
    expect(host.exists('libs/vue-components/src/lib/formatters.ts')).toBeTruthy();
    expect(
      host.exists('libs/vue-components/src/lib/formatters.spec.ts'),
    ).toBeTruthy();
    const formatters = host
      .read('libs/vue-components/src/lib/formatters.ts')
      .toString();
    for (const fn of [
      'formatDate',
      'formatDateTime',
      'formatNumber',
      'formatPercent',
    ]) {
      expect(formatters).toContain(`export function ${fn}`);
    }

    // Ships a spec so the vitest test target isn't empty (vitest exits non-zero
    // on "no test files found").
    expect(
      host.exists('libs/vue-components/src/vue-components.spec.ts'),
    ).toBeTruthy();

    // GoabModal uses goa-modal's native `slot` attribute (web component, not the
    // deprecated Vue 2 slot syntax) — the rule is turned off for this lib.
    const eslintrc = host.read('libs/vue-components/.eslintrc.json').toString();
    expect(eslintrc).toContain('"vue/no-deprecated-slot-attribute": "off"');

    // Ships agent direction for maintaining the (interim) lib, incl. a recipe
    // for wrapping additional components.
    expect(host.exists('libs/vue-components/AGENTS.md')).toBeTruthy();
    const agents = host.read('libs/vue-components/AGENTS.md').toString();
    expect(agents).toContain('Interim');
    expect(agents).toContain('detail.value');
    expect(agents).toContain('Wrapping a new component');
    expect(agents).toContain('defineModel<boolean>');

    // Catalogues the presentational goa-* elements that need no wrapper. Its
    // absence is what drove a real app to hand-roll 254 inline styles on raw
    // HTML standing in for elements that already shipped.
    expect(agents).toContain('most need no wrapper');
    for (const element of [
      'goa-container',
      'goa-block',
      'goa-grid',
      'goa-text',
      'goa-table',
      'goa-tabs',
    ]) {
      expect(agents).toContain(element);
    }
    expect(agents).toContain("Don't wrap a presentational element");
  }, 30000);

  it('AppSideMenu exposes an optional #topbar slot for header-action-style content', async () => {
    await generator(host);

    const sideMenu = host
      .read('libs/vue-components/src/lib/patterns/AppSideMenu.vue')
      .toString();
    // Named slot, only rendered when actually given content -- no empty bar
    // shows by default, matching the "unused by default" doc claim.
    expect(sideMenu).toContain('<slot name="topbar" />');
    expect(sideMenu).toContain('v-if="slots.topbar"');
    expect(sideMenu).toContain('useSlots');
  }, 30000);

  it('disables vue/no-deprecated-slot-attribute in flat config too, not just .eslintrc.json', async () => {
    // useFlatConfig() (from @nx/eslint) treats a root flat-config file's
    // presence as authoritative, regardless of the installed ESLint version —
    // this is what create-nx-workspace's current default actually looks like.
    host.write('eslint.config.mjs', 'export default [];\n');
    await generator(host);

    expect(host.exists('libs/vue-components/eslint.config.mjs')).toBeTruthy();
    expect(host.exists('libs/vue-components/.eslintrc.json')).toBeFalsy();
    const flatConfig = host
      .read('libs/vue-components/eslint.config.mjs')
      .toString();
    expect(flatConfig).toContain('"vue/no-deprecated-slot-attribute": "off"');
  }, 30000);

  it('is idempotent — a second run does not throw and keeps the wrappers', async () => {
    await generator(host);
    await expect(generator(host)).resolves.not.toThrow();
    expect(
      host.exists('libs/vue-components/src/lib/primitives/GoabInput.vue'),
    ).toBeTruthy();
  }, 30000);

  it('does not duplicate the ESLint override on a second run (legacy or flat)', async () => {
    host.write('eslint.config.mjs', 'export default [];\n');
    await generator(host);
    await generator(host);

    const flatConfig = host
      .read('libs/vue-components/eslint.config.mjs')
      .toString();
    expect(
      flatConfig.split('vue/no-deprecated-slot-attribute').length - 1,
    ).toBe(1);
  }, 30000);

  it('derives the import path from the workspace scope', () => {
    expect(vueComponentsImportPath(host)).toMatch(/\/vue-components$/);
  });

  describe('ensurePackageExports (TS-solution resolution fix)', () => {
    it('backfills exports/main/types when a lib package.json exists', () => {
      host.write(
        'libs/vue-components/package.json',
        JSON.stringify({ name: '@proj/vue-components' }),
      );
      ensurePackageExports(host, 'libs/vue-components');

      const pkg = JSON.parse(
        host.read('libs/vue-components/package.json').toString(),
      );
      expect(pkg.main).toBe('./src/index.ts');
      expect(pkg.types).toBe('./src/index.ts');
      expect(pkg.exports['.'].import).toBe('./src/index.ts');
    });

    it('does not clobber exports @nx/vue already wrote', () => {
      host.write(
        'libs/vue-components/package.json',
        JSON.stringify({
          name: '@proj/vue-components',
          exports: { '.': './dist/index.js' },
        }),
      );
      ensurePackageExports(host, 'libs/vue-components');

      const pkg = JSON.parse(
        host.read('libs/vue-components/package.json').toString(),
      );
      expect(pkg.exports['.']).toBe('./dist/index.js');
    });

    it('is a no-op for a legacy lib with no package.json', () => {
      ensurePackageExports(host, 'libs/vue-components');
      expect(host.exists('libs/vue-components/package.json')).toBeFalsy();
    });
  });
});
