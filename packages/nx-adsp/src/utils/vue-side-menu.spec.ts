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
});
