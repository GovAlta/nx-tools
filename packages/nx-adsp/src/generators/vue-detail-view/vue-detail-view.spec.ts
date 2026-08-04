import {
  addProjectConfiguration,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator from './vue-detail-view';
import { Schema } from './schema';

// Mirrors the shape vue-app's own template generates -- vue-detail-view retrofits
// into this file, so the fixture must match what it actually looks for.
const ROUTER_FIXTURE = `import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: HomeView },
  ],
});

export default router;
`;

describe('Vue Detail View Generator', () => {
  let host: Tree;
  const baseOptions: Schema = {
    project: 'test',
    name: 'application-detail',
    resource: 'applications',
    route: '/applications/:id',
    fields: [
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'lastSaved', label: 'Last saved', type: 'date' },
      { key: 'requestTotal', label: 'Request total', type: 'currency' },
      { key: 'serviceModel', label: 'Service Model' },
    ],
  };

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addProjectConfiguration(host, 'test', { root: 'apps/test' });
    host.write('apps/test/src/router/index.ts', ROUTER_FIXTURE);
  });

  it('throws when --project does not exist', async () => {
    await expect(
      generator(host, { ...baseOptions, project: 'no-such-app' }),
    ).rejects.toThrow();
  });

  it('throws when --route has no :id param', async () => {
    await expect(
      generator(host, { ...baseOptions, route: '/applications' }),
    ).rejects.toThrow(/:id/);
  });

  it("throws a clear error when the project isn't a vue-app (no router/index.ts)", async () => {
    addProjectConfiguration(host, 'not-vue', { root: 'apps/not-vue' });
    await expect(
      generator(host, { ...baseOptions, project: 'not-vue' }),
    ).rejects.toThrow(/router\/index\.ts/);
  });

  // Regression guard: Nx's own CLI option coercion for `"type": "array"` splits
  // on commas, not JSON -- --fields is `"type": "string"` in schema.json
  // specifically so the real CLI's JSON string survives unmangled. Assert the
  // string form the CLI actually produces, not just the array form direct
  // (unit-test) callers use.
  it('accepts --fields as a JSON string, the form the real CLI produces', async () => {
    await generator(host, {
      ...baseOptions,
      fields: JSON.stringify(baseOptions.fields),
    });
    const view = host
      .read('apps/test/src/views/ApplicationDetailView.vue')
      .toString();
    expect(view).toContain('<dt>Status</dt>');
  }, 30000);

  it('throws a clear error when --fields is not valid JSON', async () => {
    await expect(
      generator(host, { ...baseOptions, fields: '{not json' }),
    ).rejects.toThrow();
  });

  it('throws a clear error when --fields parses to an empty array', async () => {
    await expect(
      generator(host, { ...baseOptions, fields: '[]' }),
    ).rejects.toThrow(/non-empty/);
  });

  it('generates the view with each field type rendered correctly', async () => {
    await generator(host, baseOptions);

    const view = host
      .read('apps/test/src/views/ApplicationDetailView.vue')
      .toString();
    expect(view).toContain('heading="Application Detail"');
    expect(view).toContain("apiFetch(`/api/applications/${route.params.id}`)");
    expect(view).toContain(
      "<goa-badge type=\"information\" :content=\"String(record['status'] ?? '—')\" />",
    );
    expect(view).toContain("formatDate(record['lastSaved'])");
    expect(view).toContain("formatCurrency(record['requestTotal'])");
    expect(view).toContain("record['serviceModel'] ?? '—'");
    expect(view).toContain('<dt>Status</dt>');
    expect(view).toContain('<dt>Service Model</dt>');
    // Uses the shared shell, not hand-rolled loading/error markup.
    expect(view).toContain("import { RecordDetailShell } from '@proj/vue-components';");
    expect(view).toContain('<RecordDetailShell');
  }, 30000);

  it('respects an explicit --heading', async () => {
    await generator(host, { ...baseOptions, heading: 'Grant Application' });
    const view = host
      .read('apps/test/src/views/ApplicationDetailView.vue')
      .toString();
    expect(view).toContain('heading="Grant Application"');
  }, 30000);

  it('inserts the route into router/index.ts, requiring auth by default', async () => {
    await generator(host, baseOptions);

    const routerTs = host.read('apps/test/src/router/index.ts').toString();
    expect(routerTs).toContain("path: '/applications/:id'");
    expect(routerTs).toContain(
      "component: () => import('../views/ApplicationDetailView.vue')",
    );
    expect(routerTs).toContain('meta: { requiresAuth: true }');
    // The existing route is untouched, not replaced.
    expect(routerTs).toContain("{ path: '/', component: HomeView }");
  }, 30000);

  it('omits the requiresAuth meta when --requiresAuth=false', async () => {
    await generator(host, { ...baseOptions, requiresAuth: false });
    const routerTs = host.read('apps/test/src/router/index.ts').toString();
    expect(routerTs).not.toContain('requiresAuth');
  }, 30000);

  it('ensures the shared RecordDetailShell pattern component exists', async () => {
    await generator(host, baseOptions);
    expect(
      host.exists(
        'libs/vue-components/src/lib/patterns/RecordDetailShell.vue',
      ),
    ).toBeTruthy();
  }, 30000);

  it('does not touch the target project configuration', async () => {
    const before = readProjectConfiguration(host, 'test');
    await generator(host, baseOptions);
    const after = readProjectConfiguration(host, 'test');
    expect(after).toEqual(before);
  }, 30000);
});
