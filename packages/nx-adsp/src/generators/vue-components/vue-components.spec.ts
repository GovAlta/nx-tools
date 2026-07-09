import { readProjectConfiguration, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator, { vueComponentsImportPath } from './vue-components';

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

    // Ships agent direction for maintaining the (interim) lib, incl. a recipe
    // for wrapping additional components.
    expect(host.exists('libs/vue-components/AGENTS.md')).toBeTruthy();
    const agents = host.read('libs/vue-components/AGENTS.md').toString();
    expect(agents).toContain('Interim');
    expect(agents).toContain('detail.value');
    expect(agents).toContain('Wrapping a new component');
    expect(agents).toContain('defineModel<boolean>');
  }, 30000);

  it('is idempotent — a second run does not throw and keeps the wrappers', async () => {
    await generator(host);
    await expect(generator(host)).resolves.not.toThrow();
    expect(host.exists('libs/vue-components/src/lib/GoabInput.vue')).toBeTruthy();
  }, 30000);

  it('derives the import path from the workspace scope', () => {
    expect(vueComponentsImportPath(host)).toMatch(/\/vue-components$/);
  });
});
