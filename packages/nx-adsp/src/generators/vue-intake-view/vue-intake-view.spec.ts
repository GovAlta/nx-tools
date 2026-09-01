import {
  addProjectConfiguration,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator from './vue-intake-view';
import { Schema } from './schema';

// Mirrors the shape vue-app's own template generates -- vue-intake-view retrofits
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

describe('Vue Intake View Generator', () => {
  let host: Tree;
  const baseOptions: Schema = {
    project: 'test',
    name: 'application',
    resource: 'applications',
    route: '/applications',
    steps: [
      {
        key: 'personal-info',
        label: 'Personal information',
        fields: [{ key: 'fullName', label: 'Full name' }],
      },
      {
        key: 'contact-info',
        label: 'Contact information',
        fields: [
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone', required: false },
        ],
      },
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

  it('throws a clear error on a duplicate step key', async () => {
    await expect(
      generator(host, {
        ...baseOptions,
        steps: [
          { key: 'a', label: 'A', fields: [] },
          { key: 'a', label: 'A again', fields: [] },
        ],
      }),
    ).rejects.toThrow(/duplicate step key/);
  });

  it('throws a clear error when --steps parses to an empty array', async () => {
    await expect(
      generator(host, { ...baseOptions, steps: '[]' }),
    ).rejects.toThrow(/non-empty/);
  });

  it('generates one view per step, using the shared Stepper/StepErrorSummary and the real goa-form-stepper status enum', async () => {
    await generator(host, baseOptions);

    const step1 = host
      .read('apps/test/src/views/PersonalInfoStepView.vue')
      .toString();
    expect(step1).toContain(
      "import { Stepper, StepErrorSummary, GoabInput } from '@proj/vue-components';",
    );
    expect(step1).toContain(
      "{ key: 'personal-info', label: 'Personal information' }",
    );
    expect(step1).toContain(
      "{ key: 'contact-info', label: 'Contact information' }",
    );
    // Own step is 'incomplete' when active and not yet completed, per the real
    // goa-form-step status enum (complete/incomplete/not-started -- no "current").
    expect(step1).toContain("step.key === 'personal-info'");
    expect(step1).toContain("('incomplete' as const)");
    expect(step1).toContain("('not-started' as const)");
    // Moves to the next step's key on save.
    expect(step1).toContain('/applications/${nextId}/contact-info');

    const step2 = host
      .read('apps/test/src/views/ContactInfoStepView.vue')
      .toString();
    // Last step in the list moves to review, not another step.
    expect(step2).toContain('/applications/${nextId}/review');
    // Each step tells the Stepper which step it is (1-based) -- the generator
    // knows, so the view doesn't re-derive it from the route. Without it every
    // page renders step one as current.
    expect(step1).toContain(':step="1"');
    expect(step2).toContain(':step="2"');
    // Single-column forms ask for the narrow variant.
    const routerForm = host.read('apps/test/src/router/index.ts').toString();
    expect(routerForm).toContain("layout: 'form'");
    // A required field gets a validation block + requirement="required"; an
    // explicitly non-required one gets neither.
    expect(step2).toContain("found.push({ message: 'Email is required.'");
    expect(step2).toContain('requirement="required"');
    expect(step2).not.toContain('Phone is required');
  }, 30000);

  it('generates a review view listing every step with an Edit link, and a declaration gate on Submit', async () => {
    await generator(host, baseOptions);

    const review = host
      .read('apps/test/src/views/ApplicationReviewView.vue')
      .toString();
    expect(review).toContain("editStep('personal-info')");
    expect(review).toContain("editStep('contact-info')");
    expect(review).toContain("record['fullName'] ?? '—'");
    expect(review).toContain("record['email'] ?? '—'");
    expect(review).toContain(
      ':disabled="!declared || submitting || undefined"',
    );
    expect(review).toContain(
      "await action('applications', idParam.value, 'submit')",
    );
    expect(review).not.toContain('apiFetch');
    expect(review).toContain('watch(idParam, load, { immediate: true })');
    expect(review).not.toContain('onMounted(');
    expect(review).toContain('/applications/${idParam.value}/confirmation');
  }, 30000);

  describe('field types', () => {
    const typedSteps = JSON.stringify([
      {
        key: 'details',
        label: 'Details',
        fields: [
          { key: 'name', label: 'Name' },
          { key: 'story', label: 'Story', type: 'textarea', required: false },
          { key: 'count', label: 'Count', type: 'number' },
          { key: 'occurred', label: 'Occurred', type: 'date' },
          {
            key: 'species',
            label: 'Species',
            type: 'select',
            options: [{ value: 'wolf', label: 'Wolf' }],
          },
        ],
      },
      { key: 'review-it', label: 'Review it', fields: [] },
    ]);

    it('renders the right control for each type', async () => {
      await generator(host, { ...baseOptions, steps: typedSteps });
      const step = host
        .read('apps/test/src/views/DetailsStepView.vue')
        .toString();
      expect(step).toContain('<GoabTextarea v-model="form.story"');
      expect(step).toContain('type="number"');
      expect(step).toContain('<GoabDatePicker v-model="form.occurred"');
      expect(step).toContain('<goa-dropdown-item value="wolf" label="Wolf" />');
    });

    it('coerces number and date on save', async () => {
      await generator(host, { ...baseOptions, steps: typedSteps });
      const step = host
        .read('apps/test/src/views/DetailsStepView.vue')
        .toString();
      expect(step).toContain(
        "count: form.count === '' ? null : Number(form.count)",
      );
      expect(step).toContain(
        'occurred: toIsoDateString(form.occurred) || null',
      );
      expect(step).toContain("fromIsoDateString(data['occurred'])");
    });

    it('validates a number and a date without assuming a string', async () => {
      await generator(host, { ...baseOptions, steps: typedSteps });
      const step = host
        .read('apps/test/src/views/DetailsStepView.vue')
        .toString();
      expect(step).toContain("if (form.count === '')");
      expect(step).toContain('Count must be a number.');
      expect(step).toContain('if (!form.occurred)');
    });

    it('formats a date field on the review view rather than printing it raw', async () => {
      await generator(host, { ...baseOptions, steps: typedSteps });
      const review = host
        .read('apps/test/src/views/ApplicationReviewView.vue')
        .toString();
      expect(review).toContain("formatDate(record['occurred'])");
    });

    it('every field is still a text input when no types are given', async () => {
      await generator(host, baseOptions);
      const step = host
        .read('apps/test/src/views/PersonalInfoStepView.vue')
        .toString();
      expect(step).toContain('type="text"');
      for (const unused of ['GoabTextarea', 'GoabDatePicker', 'GoabDropdown']) {
        expect(step).not.toContain(unused);
      }
    });
  });

  // The previous version of this test asserted `{{ route.params.id }}` -- it
  // encoded the defect rather than the requirement, so the confirmation page
  // shipped presenting the storage id as "your reference number" ("Your
  // reference number is 1001" in a real build).
  it('generates a confirmation view showing the business reference, not the route id', async () => {
    await generator(host, baseOptions);
    const confirmation = host
      .read('apps/test/src/views/ApplicationConfirmationView.vue')
      .toString();
    // Fetches the record and reads the reference field off it.
    expect(confirmation).toContain("record.value?.['reference']");
    expect(confirmation).toContain("{{ loading ? '…' : reference }}");
    // The route id survives only as a fallback, never as the presented value.
    expect(confirmation).not.toContain('{{ route.params.id }}');
  }, 30000);

  it('honours --referenceField', async () => {
    await generator(host, { ...baseOptions, referenceField: 'claimNumber' });
    expect(
      host
        .read('apps/test/src/views/ApplicationConfirmationView.vue')
        .toString(),
    ).toContain("record.value?.['claimNumber']");
  }, 30000);

  it('gives the confirmation page an h1 and a route out of the flow', async () => {
    await generator(host, baseOptions);
    const confirmation = host
      .read('apps/test/src/views/ApplicationConfirmationView.vue')
      .toString();
    expect(confirmation).toContain('<h1');
    expect(confirmation).toContain('What happens next');
    expect(confirmation).toContain('<router-link to="/">');
  }, 30000);

  it('inserts a route for every step plus review and confirmation, requiring auth by default', async () => {
    await generator(host, baseOptions);

    const routerTs = host.read('apps/test/src/router/index.ts').toString();
    expect(routerTs).toContain("path: '/applications/:id/personal-info'");
    expect(routerTs).toContain("path: '/applications/:id/contact-info'");
    expect(routerTs).toContain("path: '/applications/:id/review'");
    expect(routerTs).toContain("path: '/applications/:id/confirmation'");
    expect(routerTs).toContain(
      "component: () => import('../views/PersonalInfoStepView.vue')",
    );
    expect(routerTs).toContain(
      "component: () => import('../views/ApplicationReviewView.vue')",
    );
    expect(routerTs).toContain(
      "component: () => import('../views/ApplicationConfirmationView.vue')",
    );
    expect(routerTs.split('requiresAuth: true').length - 1).toBe(4);
    // The existing route is untouched, not replaced.
    expect(routerTs).toContain("{ path: '/', component: HomeView }");
  }, 30000);

  it('omits the requiresAuth meta on every generated route when --requiresAuth=false', async () => {
    await generator(host, { ...baseOptions, requiresAuth: false });
    const routerTs = host.read('apps/test/src/router/index.ts').toString();
    expect(routerTs).not.toContain('requiresAuth');
  }, 30000);

  it('accepts --steps as a JSON string, the form the real CLI produces', async () => {
    await generator(host, {
      ...baseOptions,
      steps: JSON.stringify(baseOptions.steps),
    });
    expect(
      host.exists('apps/test/src/views/PersonalInfoStepView.vue'),
    ).toBeTruthy();
  }, 30000);

  it('ensures the shared Stepper and StepErrorSummary pattern components exist', async () => {
    await generator(host, baseOptions);
    expect(
      host.exists('libs/vue-components/src/lib/patterns/Stepper.vue'),
    ).toBeTruthy();
    expect(
      host.exists('libs/vue-components/src/lib/patterns/StepErrorSummary.vue'),
    ).toBeTruthy();
  }, 30000);

  it('does not touch the target project configuration', async () => {
    const before = readProjectConfiguration(host, 'test');
    await generator(host, baseOptions);
    const after = readProjectConfiguration(host, 'test');
    expect(after).toEqual(before);
  }, 30000);

  // The check-your-answers page exists so the person can read back what they
  // entered; a stored code ('cattle-mature', 'northwest') is not that. The
  // generator is handed the label for every option and used to discard it.
  it('renders coded answers as labels on the review page', async () => {
    await generator(host, {
      ...baseOptions,
      steps: [
        {
          key: 'losses',
          label: 'Losses',
          fields: [
            {
              key: 'species',
              label: 'Species',
              type: 'select',
              options: [{ value: 'cattle-mature', label: 'Cattle (mature)' }],
            },
          ],
        },
      ],
    });
    const review = host
      .read('apps/test/src/views/ApplicationReviewView.vue')
      .toString();
    expect(review).toContain(
      "optionLabel(fieldOptions['species'], record['species'])",
    );
    expect(review).toContain('Cattle (mature)');
  }, 30000);

  it('spaces stacked form items in each step', async () => {
    await generator(host, baseOptions);
    const step = host
      .read('apps/test/src/views/PersonalInfoStepView.vue')
      .toString();
    // Counted per tag rather than as a contiguous string: formatFiles reflows a
    // multi-attribute tag across lines, so `<goa-form-item mb="l"` is not a
    // reliable substring.
    const tags = step
      .split('<goa-form-item')
      .slice(1)
      .map((fragment) => fragment.slice(0, fragment.indexOf('>')));
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag).toContain('mb="l"');
    }
  }, 30000);

  // Regression: the review page's <dl> was unstyled, so terms and values stacked
  // flush -- every answer ran into the next on the page whose entire purpose is
  // being read back before submitting. vue-detail-view already styled its
  // equivalent list; this is the same fix, not a new idea.
  it('gives the review page label/value list real spacing', async () => {
    await generator(host, baseOptions);
    const review = host
      .read('apps/test/src/views/ApplicationReviewView.vue')
      .toString();
    expect(review).toContain('<dl class="review-fields">');
    expect(review).toContain('grid-template-columns: auto 1fr');
    expect(review).toContain('gap: var(--goa-space-xs) var(--goa-space-l)');
  }, 30000);
});
