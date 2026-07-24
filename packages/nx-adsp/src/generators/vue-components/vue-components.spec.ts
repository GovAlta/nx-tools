import { readProjectConfiguration, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator, { ensurePackageExports, vueComponentsImportPath } from './vue-components';

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
    await generator(host);

    const config = readProjectConfiguration(host, 'vue-components');
    expect(config.root).toBe('libs/vue-components');

    const base = 'libs/vue-components/src/lib';
    for (const name of [
      'GoabInput', 'GoabTextarea', 'GoabDropdown', 'GoabCheckbox',
      'GoabRadioGroup', 'GoabButton', 'GoabModal',
    ]) {
      expect(host.exists(`${base}/${name}.vue`)).toBeTruthy();
    }
    const index = host.read('libs/vue-components/src/index.ts').toString();
    expect(index).toContain("export { default as GoabInput }");
    expect(index).toContain('@abgov/vue-components'); // interim marker

    // Ships a spec so the vitest test target isn't empty (vitest exits non-zero
    // on "no test files found").
    expect(host.exists('libs/vue-components/src/vue-components.spec.ts')).toBeTruthy();

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
  }, 30000);

  it('disables vue/no-deprecated-slot-attribute in flat config too, not just .eslintrc.json', async () => {
    // useFlatConfig() (from @nx/eslint) treats a root flat-config file's
    // presence as authoritative, regardless of the installed ESLint version —
    // this is what create-nx-workspace's current default actually looks like.
    host.write('eslint.config.mjs', 'export default [];\n');
    await generator(host);

    expect(host.exists('libs/vue-components/eslint.config.mjs')).toBeTruthy();
    expect(host.exists('libs/vue-components/.eslintrc.json')).toBeFalsy();
    const flatConfig = host.read('libs/vue-components/eslint.config.mjs').toString();
    expect(flatConfig).toContain('"vue/no-deprecated-slot-attribute": "off"');
  }, 30000);

  it('is idempotent — a second run does not throw and keeps the wrappers', async () => {
    await generator(host);
    await expect(generator(host)).resolves.not.toThrow();
    expect(host.exists('libs/vue-components/src/lib/GoabInput.vue')).toBeTruthy();
  }, 30000);

  it('does not duplicate the ESLint override on a second run (legacy or flat)', async () => {
    host.write('eslint.config.mjs', 'export default [];\n');
    await generator(host);
    await generator(host);

    const flatConfig = host.read('libs/vue-components/eslint.config.mjs').toString();
    expect(flatConfig.split('vue/no-deprecated-slot-attribute').length - 1).toBe(1);
  }, 30000);

  it('derives the import path from the workspace scope', () => {
    expect(vueComponentsImportPath(host)).toMatch(/\/vue-components$/);
  });

  describe('ensurePackageExports (TS-solution resolution fix)', () => {
    it('backfills exports/main/types when a lib package.json exists', () => {
      host.write('libs/vue-components/package.json', JSON.stringify({ name: '@proj/vue-components' }));
      ensurePackageExports(host, 'libs/vue-components');

      const pkg = JSON.parse(host.read('libs/vue-components/package.json').toString());
      expect(pkg.main).toBe('./src/index.ts');
      expect(pkg.types).toBe('./src/index.ts');
      expect(pkg.exports['.'].import).toBe('./src/index.ts');
    });

    it('does not clobber exports @nx/vue already wrote', () => {
      host.write(
        'libs/vue-components/package.json',
        JSON.stringify({ name: '@proj/vue-components', exports: { '.': './dist/index.js' } })
      );
      ensurePackageExports(host, 'libs/vue-components');

      const pkg = JSON.parse(host.read('libs/vue-components/package.json').toString());
      expect(pkg.exports['.']).toBe('./dist/index.js');
    });

    it('is a no-op for a legacy lib with no package.json', () => {
      ensurePackageExports(host, 'libs/vue-components');
      expect(host.exists('libs/vue-components/package.json')).toBeFalsy();
    });
  });
});
