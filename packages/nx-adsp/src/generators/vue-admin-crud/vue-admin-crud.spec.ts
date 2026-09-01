import {
  addProjectConfiguration,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator from './vue-admin-crud';
import { Schema } from './schema';

// Mirrors the shape vue-app's own template generates -- vue-admin-crud retrofits
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

describe('Vue Admin CRUD Generator', () => {
  let host: Tree;
  const baseOptions: Schema = {
    project: 'test',
    name: 'regions',
    resource: 'regions',
    route: '/regions',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'active', label: 'Active', type: 'checkbox' },
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

  it('generates the list view with a Create action and per-row Edit, no pagination props', async () => {
    await generator(host, baseOptions);

    const view = host
      .read('apps/test/src/views/RegionsListView.vue')
      .toString();
    expect(view).toContain('<h1>Regions</h1>');
    expect(view).toContain("await list('regions')");
    // The envelope shape is the adapter's business, not the view's.
    expect(view).not.toContain('data.results');
    expect(view).toContain(
      "import { WorkspaceTable } from '@proj/vue-components';",
    );
    expect(view).toContain('<WorkspaceTable');
    // No pagination props bound -- this is the "reused without its pagination/
    // filter props" case, unlike vue-workspace-view (the WorkspaceTable tag
    // itself contains a comment explaining why, hence checking for the bound
    // attribute specifically rather than the bare word).
    expect(view).not.toContain(':item-count=');
    expect(view).not.toContain(':per-page-count=');
    expect(view).toContain('to="/regions/new"');
    expect(view).toContain('Create Regions');
    expect(view).toContain(':to="`/regions/${row.id}`"');
    // Checkbox field renders as a Yes/No badge in the list.
    expect(view).toContain('#cell-active="{ row }"');
    expect(view).toContain("row['active'] ? 'Yes' : 'No'");
  }, 30000);

  it('generates the edit view with create/update, field-level validation, and success + redirect', async () => {
    await generator(host, baseOptions);

    const view = host
      .read('apps/test/src/views/RegionsEditView.vue')
      .toString();
    expect(view).toContain("idParam.value === 'new' || idParam.value === ''");
    expect(view).toContain(
      "import { GoabInput, GoabCheckbox } from '@proj/vue-components';",
    );
    expect(view).toContain('name.trim()');
    expect(view).toContain("errors.name = 'Name is required.';");
    // Checkbox has no required-validation block.
    expect(view).not.toContain('errors.active');
    // Create vs. update is expressed as a null id; which verb and path that
    // becomes is decided by useApi's adapter.
    // payload(), not the raw form: the model holds what the controls need, the
    // API wants wire types.
    expect(view).toContain(
      "await save('regions', isNew.value ? null : idParam.value, payload())",
    );
    expect(view).toContain("await get('regions', idParam.value)");
    expect(view).not.toContain('apiFetch');
    expect(view).not.toContain("'PUT'");

    // Vue Router reuses this component across an id-only change. The reset
    // branch is the point: edit/<id> -> edit/new must not leave the previous
    // record's values in a create form.
    expect(view).toContain('watch(');
    expect(view).toContain('{ immediate: true }');
    expect(view).toContain('function resetForm()');
    expect(view).toContain('resetForm();');
    expect(view).not.toContain('onMounted(');

    // The 600ms success redirect must not fire after the user navigates away.
    expect(view).toContain('redirectTimer = setTimeout(');
    expect(view).toContain('clearTimeout(redirectTimer)');
    expect(view).toContain('onUnmounted(');
    expect(view).toContain("router.push('/regions')");
    expect(view).toContain('Create Regions');
    expect(view).toContain('Edit Regions');
  }, 30000);

  describe('field types', () => {
    const allTypes = JSON.stringify([
      { key: 'name', label: 'Name' },
      { key: 'notes', label: 'Notes', type: 'textarea', required: false },
      { key: 'quota', label: 'Quota', type: 'number' },
      { key: 'effective', label: 'Effective', type: 'date' },
      {
        key: 'region',
        label: 'Region',
        type: 'select',
        options: [
          { value: 'north', label: 'North' },
          { value: 'south', label: 'South' },
        ],
      },
      { key: 'active', label: 'Active', type: 'checkbox' },
    ]);

    it('renders the right control for each type', async () => {
      await generator(host, { ...baseOptions, fields: allTypes });
      const view = host
        .read('apps/test/src/views/RegionsEditView.vue')
        .toString();
      expect(view).toContain('<GoabInput v-model="form.name"');
      expect(view).toContain('<GoabTextarea v-model="form.notes"');
      expect(view).toContain('type="number"');
      expect(view).toContain('<GoabDatePicker v-model="form.effective"');
      expect(view).toContain('<GoabDropdown v-model="form.region"');
      expect(view).toContain(
        '<goa-dropdown-item value="north" label="North" />',
      );
      expect(view).toContain('<GoabCheckbox v-model="form.active"');
    });

    it('imports only the wrappers the field set actually uses', async () => {
      await generator(host, {
        ...baseOptions,
        fields: JSON.stringify([{ key: 'name', label: 'Name' }]),
      });
      const view = host
        .read('apps/test/src/views/RegionsEditView.vue')
        .toString();
      expect(view).toContain('GoabInput');
      for (const unused of ['GoabTextarea', 'GoabDatePicker', 'GoabDropdown']) {
        expect(view).not.toContain(unused);
      }
    });

    it('submits a number as a number and a date as a local-calendar string', async () => {
      await generator(host, { ...baseOptions, fields: allTypes });
      const view = host
        .read('apps/test/src/views/RegionsEditView.vue')
        .toString();
      expect(view).toContain(
        "quota: form.quota === '' ? null : Number(form.quota)",
      );
      expect(view).toContain(
        'effective: toIsoDateString(form.effective) || null',
      );
      // A stored YYYY-MM-DD comes back as a Date the picker can redisplay.
      expect(view).toContain("fromIsoDateString(data['effective'])");
    });

    it('validates by type, not by assuming every value is a string', async () => {
      await generator(host, { ...baseOptions, fields: allTypes });
      const view = host
        .read('apps/test/src/views/RegionsEditView.vue')
        .toString();
      // A number field's required check cannot be !value.trim().
      expect(view).toContain("if (form.quota === '')");
      expect(view).toContain('Quota must be a number.');
      // A date field holds a Date, so truthiness is the check.
      expect(view).toContain('if (!form.effective)');
    });

    it('does not label a checkbox twice', async () => {
      await generator(host, { ...baseOptions, fields: allTypes });
      const view = host
        .read('apps/test/src/views/RegionsEditView.vue')
        .toString();
      // goa-form-item must not repeat the label the checkbox already carries.
      expect(view).not.toContain('<goa-form-item label="Active"');
      expect(view).toContain('text="Active"');
    });

    it('rejects a type it cannot render', async () => {
      await expect(
        generator(host, {
          ...baseOptions,
          fields: JSON.stringify([{ key: 'x', label: 'X', type: 'colour' }]),
        }),
      ).rejects.toThrow('got "colour" for "x"');
    });

    it('requires options for a select, since it cannot know the choices', async () => {
      await expect(
        generator(host, {
          ...baseOptions,
          fields: JSON.stringify([{ key: 'r', label: 'R', type: 'select' }]),
        }),
      ).rejects.toThrow(/options is required for the select field "r"/);
    });
  });

  it('uses --singularLabel over --heading for Create/Edit headings when both are set', async () => {
    await generator(host, {
      ...baseOptions,
      heading: 'Regions',
      singularLabel: 'Region',
    });
    const list = host
      .read('apps/test/src/views/RegionsListView.vue')
      .toString();
    const edit = host
      .read('apps/test/src/views/RegionsEditView.vue')
      .toString();
    expect(list).toContain('<h1>Regions</h1>');
    expect(list).toContain('Create Region');
    expect(edit).toContain('Create Region');
    expect(edit).toContain('Edit Region');
  }, 30000);

  it('marks a field as not required with --fields[].required=false', async () => {
    await generator(host, {
      ...baseOptions,
      fields: [{ key: 'name', label: 'Name', required: false }],
    });
    const edit = host
      .read('apps/test/src/views/RegionsEditView.vue')
      .toString();
    expect(edit).not.toContain("errors.name = 'Name is required.'");
    expect(edit).not.toContain('requirement="required"');
  }, 30000);

  it('accepts --fields as a JSON string, the form the real CLI produces', async () => {
    await generator(host, {
      ...baseOptions,
      fields: JSON.stringify(baseOptions.fields),
    });
    const view = host
      .read('apps/test/src/views/RegionsListView.vue')
      .toString();
    expect(view).toContain("{ key: 'name', label: 'Name' }");
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

  it('inserts both the list and edit routes, requiring auth by default', async () => {
    await generator(host, baseOptions);

    const routerTs = host.read('apps/test/src/router/index.ts').toString();
    expect(routerTs).toContain("path: '/regions'");
    expect(routerTs).toContain("path: '/regions/:id'");
    expect(routerTs).toContain(
      "component: () => import('../views/RegionsListView.vue')",
    );
    expect(routerTs).toContain(
      "component: () => import('../views/RegionsEditView.vue')",
    );
    expect(routerTs.split('requiresAuth: true').length - 1).toBe(2);
    // The existing route is untouched, not replaced.
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

  // Regression: both actions were gated on `kc.authenticated` unconditionally,
  // ignoring --requiresAuth. With --requiresAuth=false a consumer got a fillable
  // form whose only button was Cancel, and a list with no Create button, and no
  // message explaining why. Access control belongs to the route guard (which
  // already honours requiresAuth via route meta), not to markup in the view --
  // and vue-intake-view never had this gate, so the two disagreed.
  it('does not gate its actions on kc.authenticated', async () => {
    await generator(host, { ...baseOptions, requiresAuth: false });
    const list = host
      .read('apps/test/src/views/RegionsListView.vue')
      .toString();
    const edit = host
      .read('apps/test/src/views/RegionsEditView.vue')
      .toString();
    for (const view of [list, edit]) {
      expect(view).not.toContain('kc.authenticated');
      expect(view).not.toContain('useKeycloak');
    }
    // The actions themselves are still there, unconditionally. Matched loosely
    // because formatFiles reflows the long button tag across lines.
    expect(list).toContain('<router-link to="/regions/new">');
    expect(edit).toMatch(/<goa-button[\s\S]{0,120}type="primary"/);
    expect(edit).toContain('@_click="onSubmit"');
  }, 30000);

  it('renders a coded field using its label, not the stored code', async () => {
    await generator(host, {
      ...baseOptions,
      fields: [
        { key: 'name', label: 'Name' },
        {
          key: 'species',
          label: 'Species',
          type: 'select',
          options: [{ value: 'cattle-mature', label: 'Cattle (mature)' }],
        },
      ],
    });
    const list = host
      .read('apps/test/src/views/RegionsListView.vue')
      .toString();
    expect(list).toContain(
      "optionLabel(fieldOptions['species'], row['species'])",
    );
    expect(list).toContain('Cattle (mature)');
  }, 30000);
});
