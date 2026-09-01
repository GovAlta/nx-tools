import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { insertSideMenuItem } from './vue-side-menu';

const INTERNAL_APP = `<script setup lang="ts">
const primaryItems = [
  { label: 'Home', to: '/' },
];
</script>
`;

// A header-layout app has no side menu at all, so no array to insert into.
const HEADER_APP = `<script setup lang="ts">
const accountItems = computed(() => []);
</script>
`;

describe('insertSideMenuItem', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('inserts an item into the app nav array', () => {
    host.write('apps/staff/src/App.vue', INTERNAL_APP);
    insertSideMenuItem(host, 'apps/staff', {
      label: 'Review queue',
      to: '/queue',
    });
    const app = host.read('apps/staff/src/App.vue').toString();
    expect(app).toContain("{ label: 'Review queue', to: '/queue' },");
    // The seeded Home entry survives.
    expect(app).toContain("{ label: 'Home', to: '/' },");
  });

  it('is idempotent on the same route', () => {
    host.write('apps/staff/src/App.vue', INTERNAL_APP);
    const item = { label: 'Review queue', to: '/queue' };
    insertSideMenuItem(host, 'apps/staff', item);
    insertSideMenuItem(host, 'apps/staff', item);
    const app = host.read('apps/staff/src/App.vue').toString();
    expect(app.split("to: '/queue'").length - 1).toBe(1);
  });

  it('does not re-add a route already present under a different label', () => {
    host.write('apps/staff/src/App.vue', INTERNAL_APP);
    insertSideMenuItem(host, 'apps/staff', { label: 'Queue', to: '/queue' });
    insertSideMenuItem(host, 'apps/staff', { label: 'Renamed', to: '/queue' });
    const app = host.read('apps/staff/src/App.vue').toString();
    expect(app).toContain("label: 'Queue'");
    expect(app).not.toContain("label: 'Renamed'");
  });

  it('is a silent no-op on a header-layout app with no side menu', () => {
    host.write('apps/public/src/App.vue', HEADER_APP);
    expect(() =>
      insertSideMenuItem(host, 'apps/public', {
        label: 'Review queue',
        to: '/queue',
      }),
    ).not.toThrow();
    expect(host.read('apps/public/src/App.vue').toString()).toBe(HEADER_APP);
  });

  it('is a silent no-op when there is no App.vue at all', () => {
    expect(() =>
      insertSideMenuItem(host, 'apps/missing', { label: 'X', to: '/x' }),
    ).not.toThrow();
  });

  // The original spec asserted both items were present but never their relative
  // order, so it passed while the function prepended and pushed Home to the
  // bottom of every generated app's nav.
  it("appends after the shell's own Home entry rather than before it", () => {
    host.write('apps/staff/src/App.vue', INTERNAL_APP);
    insertSideMenuItem(host, 'apps/staff', {
      label: 'Review queue',
      to: '/queue',
    });
    const app = host.read('apps/staff/src/App.vue')?.toString() ?? '';
    expect(app.indexOf("to: '/'")).toBeLessThan(app.indexOf("to: '/queue'"));
  });

  it('accumulates multiple items in the order they were added', () => {
    host.write('apps/staff/src/App.vue', INTERNAL_APP);
    insertSideMenuItem(host, 'apps/staff', { label: 'Queue', to: '/queue' });
    insertSideMenuItem(host, 'apps/staff', {
      label: 'Livestock categories',
      to: '/livestock',
    });
    const app = host.read('apps/staff/src/App.vue')?.toString() ?? '';
    expect(app.indexOf("to: '/'")).toBeLessThan(app.indexOf("to: '/queue'"));
    expect(app.indexOf("to: '/queue'")).toBeLessThan(
      app.indexOf("to: '/livestock'"),
    );
  });

  it('emits the icon, which the element needs to render a non-blank item', () => {
    host.write('apps/staff/src/App.vue', INTERNAL_APP);
    insertSideMenuItem(host, 'apps/staff', {
      label: 'Queue',
      to: '/queue',
      icon: 'list',
    });
    expect(host.read('apps/staff/src/App.vue')?.toString()).toContain(
      "{ label: 'Queue', to: '/queue', icon: 'list' },",
    );
  });

  it('appends validly when the array literal has no trailing comma', () => {
    host.write(
      'apps/staff/src/App.vue',
      `<script setup lang="ts">
const primaryItems = [{ label: 'Home', to: '/' }];
</script>
`,
    );
    insertSideMenuItem(host, 'apps/staff', { label: 'Queue', to: '/queue' });
    const app = host.read('apps/staff/src/App.vue')?.toString() ?? '';
    expect(app).toContain("{ label: 'Home', to: '/' },");
    expect(app.indexOf("to: '/'")).toBeLessThan(app.indexOf("to: '/queue'"));
  });

  it('does not end its scan early on a bracket inside a label', () => {
    host.write(
      'apps/staff/src/App.vue',
      `<script setup lang="ts">
const primaryItems = [
  { label: 'Reports [beta]', to: '/reports' },
];
</script>
`,
    );
    insertSideMenuItem(host, 'apps/staff', { label: 'Queue', to: '/queue' });
    const app = host.read('apps/staff/src/App.vue')?.toString() ?? '';
    expect(app.indexOf("to: '/reports'")).toBeLessThan(
      app.indexOf("to: '/queue'"),
    );
  });

  it('is a silent no-op on an unterminated array literal', () => {
    const broken = `<script setup lang="ts">
const primaryItems = [
</script>
`;
    host.write('apps/staff/src/App.vue', broken);
    insertSideMenuItem(host, 'apps/staff', { label: 'Queue', to: '/queue' });
    expect(host.read('apps/staff/src/App.vue')?.toString()).toBe(broken);
  });

  it('does not leave blank lines between accumulated entries', () => {
    host.write('apps/staff/src/App.vue', INTERNAL_APP);
    insertSideMenuItem(host, 'apps/staff', {
      label: 'A',
      to: '/a',
      icon: 'list',
    });
    insertSideMenuItem(host, 'apps/staff', {
      label: 'B',
      to: '/b',
      icon: 'list',
    });
    const app = host.read('apps/staff/src/App.vue')?.toString() ?? '';
    const array = app.slice(
      app.indexOf('const primaryItems = ['),
      app.indexOf('];') + 2,
    );
    expect(array).not.toMatch(/\n\s*\n/);
  });
});
