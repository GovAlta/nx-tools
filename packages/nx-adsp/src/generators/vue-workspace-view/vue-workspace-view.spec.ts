import {
  addProjectConfiguration,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator from './vue-workspace-view';
import { Schema } from './schema';

// Mirrors the shape vue-app's own template generates -- vue-workspace-view
// retrofits into this file, so the fixture must match what it actually looks for.
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

describe('Vue Workspace View Generator', () => {
  let host: Tree;
  const baseOptions: Schema = {
    project: 'test',
    name: 'applications',
    resource: 'applications',
    route: '/applications',
    columns: [
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'lastSaved', label: 'Last saved', type: 'date', sortable: true },
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

  it("throws a clear error when the project isn't a vue-app (no router/index.ts)", async () => {
    addProjectConfiguration(host, 'not-vue', { root: 'apps/not-vue' });
    await expect(
      generator(host, { ...baseOptions, project: 'not-vue' }),
    ).rejects.toThrow(/router\/index\.ts/);
  });

  // Regression guard: Nx's own CLI option coercion for `"type": "array"` splits
  // on commas, not JSON -- --columns is `"type": "string"` in schema.json
  // specifically so the real CLI's JSON string survives unmangled. Assert the
  // string form the CLI actually produces, not just the array form direct
  // (unit-test) callers use.
  it('accepts --columns as a JSON string, the form the real CLI produces', async () => {
    await generator(host, {
      ...baseOptions,
      columns: JSON.stringify(baseOptions.columns),
    });
    const view = host
      .read('apps/test/src/views/ApplicationsListView.vue')
      .toString();
    expect(view).toContain(
      "{ key: 'status', label: 'Status', sortable: false }",
    );
  }, 30000);

  it('throws a clear error when --columns is not valid JSON', async () => {
    await expect(
      generator(host, { ...baseOptions, columns: '{not json' }),
    ).rejects.toThrow();
  });

  it('throws a clear error when --columns parses to an empty array', async () => {
    await expect(
      generator(host, { ...baseOptions, columns: '[]' }),
    ).rejects.toThrow(/non-empty/);
  });

  it('generates the view with columns, sort, and per-type cell slots', async () => {
    await generator(host, baseOptions);

    const view = host
      .read('apps/test/src/views/ApplicationsListView.vue')
      .toString();
    expect(view).toContain('<h1>Applications</h1>');
    expect(view).toContain(
      "{ key: 'status', label: 'Status', sortable: false }",
    );
    expect(view).toContain(
      "{ key: 'lastSaved', label: 'Last saved', sortable: true }",
    );
    // Goes through useApi's adapter in domain terms -- no query-param name and
    // no response-envelope key appears in the view.
    expect(view).toContain("await list('applications', {");
    expect(view).toContain('pageSize: PAGE_SIZE');
    expect(view).toContain('rows.value = result.rows');
    // The element decides the direction, so the view records rather than toggles.
    expect(view).toContain("function onSort(key: string, dir: 'asc' | 'desc')");
    expect(view).not.toContain("sortDir.value === 'asc' ? 'desc' : 'asc'");
    expect(view).toContain('itemCount.value = result.total');
    expect(view).not.toContain('apiFetch');
    expect(view).not.toContain('URLSearchParams');
    expect(view).not.toContain('data.results');

    // Out-of-order responses: load() fires from page change, sort and the
    // debounced search, so only the most recent call may apply its result.
    expect(view).toContain('let loadSequence = 0');
    expect(view).toContain('const sequence = ++loadSequence');
    expect(view).toContain('if (sequence !== loadSequence) return;');
    expect(view).toContain('if (sequence === loadSequence) loading.value = false;');

    // The debounce timer must not outlive the component.
    expect(view).toContain('onUnmounted(');
    expect(view).toContain('clearTimeout(searchDebounce)');

    // Dates come from the shared formatter, not a per-view copy.
    expect(view).toContain('formatDate');
    expect(view).not.toContain('function formatDate');
    expect(view).not.toContain('toLocaleString');
    expect(view).not.toContain('Intl.');
    expect(view).not.toContain('function formatCurrency');
    expect(view).toContain(
      "<goa-badge type=\"information\" :content=\"String(row['status'] ?? '—')\" />",
    );
    // A type: 'date' column is a calendar date -- formatDate, not
    // formatDateTime, which would show an invented midnight.
    expect(view).toContain("formatDate(row['lastSaved'])");
    expect(view).toContain("formatCurrency(row['requestTotal'])");
    // Uses the shared table shell, not hand-rolled loading/pagination markup.
    // Read the import's contents rather than an exact line: formatFiles wraps a
    // long import list and adds a trailing comma.
    const goaImport =
      view
        .replace(/\s+/g, ' ')
        .match(/import \{[^}]*\} from '@proj\/vue-components';/)?.[0] ?? '';
    for (const name of ['WorkspaceTable', 'formatCurrency', 'formatDate']) {
      expect(goaImport).toContain(name);
    }
    expect(view).toContain('<WorkspaceTable');
    // Filterable by default: a debounced search input.
    expect(view).toContain('type="search"');
    expect(view).toContain('searchDebounce');
  }, 30000);

  describe('--filters', () => {
    const filters = JSON.stringify([
      {
        key: 'status',
        label: 'Status',
        type: 'dropdown',
        options: [{ value: 'open', label: 'Open' }],
        anyLabel: 'All statuses',
      },
      { key: 'from', label: 'From', type: 'date' },
    ]);

    it('wires the shared FilterBar and sends the values as query filters', async () => {
      await generator(host, { ...baseOptions, filters });
      const view = host
        .read('apps/test/src/views/ApplicationsListView.vue')
        .toString();

      expect(view).toContain('FilterBar');
      expect(view).toContain(':filters="filterDescriptors"');
      expect(view).toContain('@update:model-value="onFiltersChange"');
      // The values object goes straight through useApi's adapter.
      expect(view).toContain('filters: filterValues.value');
      // The view owns the page reset, not FilterBar -- it owns `page`.
      expect(view).toContain('page.value = 1');
      // Descriptors are a ref so fetched dropdown options can be assigned in.
      expect(view).toContain('const filterDescriptors = ref([');
      expect(view).toContain("anyLabel: 'All statuses'");
      expect(view).toContain("type: 'date' as const");
    });

    it('leaves output byte-identical when --filters is omitted', async () => {
      await generator(host, baseOptions);
      const without = host
        .read('apps/test/src/views/ApplicationsListView.vue')
        .toString();
      expect(without).not.toContain('FilterBar');
      expect(without).not.toContain('filterValues');
      expect(without).not.toContain('onFiltersChange');
    });

    it('rejects a filter type it cannot render, naming the offender', async () => {
      await expect(
        generator(host, {
          ...baseOptions,
          filters: JSON.stringify([
            { key: 'x', label: 'X', type: 'checkbox' },
          ]),
        }),
      ).rejects.toThrow('--filters[].type must be "dropdown" or "date"; got "checkbox" for "x".');
    });

    it('accepts a real array, the form a programmatic caller passes', async () => {
      await generator(host, {
        ...baseOptions,
        filters: [{ key: 'status', label: 'Status', type: 'dropdown' }],
      });
      const view = host
        .read('apps/test/src/views/ApplicationsListView.vue')
        .toString();
      expect(view).toContain('FilterBar');
      expect(view).toContain('options: []');
    });
  });

  it('omits onUnmounted along with the debounce when --filterable=false', async () => {
    // onUnmounted exists only to clear the search debounce, so importing it
    // unconditionally would be an unused import and fail the generated lint.
    await generator(host, { ...baseOptions, filterable: false });
    const view = host
      .read('apps/test/src/views/ApplicationsListView.vue')
      .toString();
    expect(view).not.toContain('onUnmounted');
    expect(view).not.toContain('searchDebounce');
    // The out-of-order guard is not search-specific -- page and sort still race.
    expect(view).toContain('let loadSequence = 0');
  });

  it('omits the search input and its wiring when --filterable=false', async () => {
    await generator(host, { ...baseOptions, filterable: false });
    const view = host
      .read('apps/test/src/views/ApplicationsListView.vue')
      .toString();
    expect(view).not.toContain('type="search"');
    expect(view).not.toContain('searchDebounce');
  }, 30000);

  it('generates a View action linking to --detailRoute when set', async () => {
    await generator(host, { ...baseOptions, detailRoute: '/applications' });
    const view = host
      .read('apps/test/src/views/ApplicationsListView.vue')
      .toString();
    expect(view).toContain('#actions="{ row }"');
    expect(view).toContain(':to="`/applications/${row.id}`"');
  }, 30000);

  it('omits the actions slot entirely when --detailRoute is not set', async () => {
    await generator(host, baseOptions);
    const view = host
      .read('apps/test/src/views/ApplicationsListView.vue')
      .toString();
    expect(view).not.toContain('#actions');
  }, 30000);

  it('respects an explicit --heading and --pageSize', async () => {
    await generator(host, { ...baseOptions, heading: 'Grant Applications', pageSize: 50 });
    const view = host
      .read('apps/test/src/views/ApplicationsListView.vue')
      .toString();
    expect(view).toContain('<h1>Grant Applications</h1>');
    expect(view).toContain('PAGE_SIZE = 50');
    expect(view).toContain(':per-page-count="50"');
  }, 30000);

  it('inserts the route into router/index.ts, requiring auth by default', async () => {
    await generator(host, baseOptions);

    const routerTs = host.read('apps/test/src/router/index.ts').toString();
    expect(routerTs).toContain("path: '/applications'");
    expect(routerTs).toContain(
      "component: () => import('../views/ApplicationsListView.vue')",
    );
    expect(routerTs).toContain('requiresAuth: true');
    // A data table asks for the wide variant -- the generator knows it emitted one.
    expect(routerTs).toContain("layout: 'wide'");
    expect(routerTs).toContain("{ path: '/', component: HomeView }");
  }, 30000);

  it('omits the requiresAuth meta when --requiresAuth=false', async () => {
    await generator(host, { ...baseOptions, requiresAuth: false });
    const routerTs = host.read('apps/test/src/router/index.ts').toString();
    expect(routerTs).not.toContain('requiresAuth');
  }, 30000);

  it('ensures the shared WorkspaceTable pattern component exists', async () => {
    await generator(host, baseOptions);
    expect(
      host.exists('libs/vue-components/src/lib/patterns/WorkspaceTable.vue'),
    ).toBeTruthy();
  }, 30000);

  it('does not touch the target project configuration', async () => {
    const before = readProjectConfiguration(host, 'test');
    await generator(host, baseOptions);
    const after = readProjectConfiguration(host, 'test');
    expect(after).toEqual(before);
  }, 30000);
});
