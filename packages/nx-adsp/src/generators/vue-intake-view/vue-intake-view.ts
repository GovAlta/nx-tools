import {
  formatFiles,
  generateFiles,
  names,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import * as path from 'path';
import { insertVueRoute } from '../../utils/vue-router';
import vueComponentsGenerator, {
  vueComponentsImportPath,
} from '../vue-components/vue-components';
import { IntakeViewStep, NormalizedSchema, Schema } from './schema';

// Nx's own CLI option coercion (coerceTypesInOptions in nx/src/utils/params)
// only knows how to split an array-typed option on commas -- it has no JSON
// support, so a real `"type": "array"` schema for --steps silently mangles a
// JSON array into garbage fragments when invoked from the actual CLI (only
// programmatic callers, like this generator's own unit tests, ever pass a
// real array). --steps is `"type": "string"` in schema.json specifically so
// Nx leaves it alone, and this generator parses the JSON itself.
function parseSteps(steps: Schema['steps']): IntakeViewStep[] {
  const parsed = typeof steps === 'string' ? JSON.parse(steps) : steps;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      '--steps must be a non-empty JSON array of { key, label, fields } objects.',
    );
  }
  const keys = new Set<string>();
  for (const step of parsed) {
    if (keys.has(step.key)) {
      throw new Error(`--steps has a duplicate step key: "${step.key}".`);
    }
    keys.add(step.key);
  }
  return parsed;
}

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const { root: projectRoot } = readProjectConfiguration(host, options.project);
  return {
    ...options,
    projectRoot,
    steps: parseSteps(options.steps),
    requiresAuth: options.requiresAuth ?? true,
    referenceField: options.referenceField ?? 'reference',
    // Sentence-case the name for prose headings ("claim" -> "Claim"), so the
    // confirmation reads as a service page rather than repeating a slug.
    heading: options.heading ?? names(options.name).className,
    baseName: names(options.name).className,
  };
}

// PascalCase view name for a step, e.g. "personal-info" -> "PersonalInfoStepView".
function stepViewFileName(stepKey: string): string {
  return `${names(stepKey).className}StepView`;
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = normalizeOptions(host, options);
  const { projectRoot, steps, baseName } = normalizedOptions;

  // Idempotent -- ensures Stepper/StepErrorSummary exist even in a project
  // scaffolded before vue-components carried them.
  await vueComponentsGenerator(host);

  const goaImportPath = vueComponentsImportPath(host);
  const reviewViewFileName = `${baseName}ReviewView`;
  const confirmationViewFileName = `${baseName}ConfirmationView`;

  const stepperSteps = steps.map((step) => ({
    key: step.key,
    label: step.label,
  }));

  steps.forEach((step, index) => {
    const nextStepKey =
      index === steps.length - 1 ? 'review' : steps[index + 1].key;

    generateFiles(host, path.join(__dirname, 'files/steps'), projectRoot, {
      ...normalizedOptions,
      goaImportPath,
      stepViewFileName: stepViewFileName(step.key),
      stepKey: step.key,
      stepLabel: step.label,
      stepFields: step.fields,
      stepperSteps,
      nextStepKey,
      // 1-based, for goa-form-stepper's own `step` prop. The generator knows
      // which step it is emitting; the view would otherwise have to re-derive
      // it from the route.
      stepNumber: index + 1,
      tmpl: '',
    });
  });

  generateFiles(host, path.join(__dirname, 'files/shared'), projectRoot, {
    ...normalizedOptions,
    goaImportPath,
    reviewViewFileName,
    confirmationViewFileName,
    // Derived here, not tested inline: EJS throws a ReferenceError on a bare
    // undefined variable, so a flag the template reads must always be defined.
    hasCodedFields: steps.some((step) =>
      step.fields.some((field) => field.options?.length),
    ),
    tmpl: '',
  });

  // Registered in reverse so the final router file lists steps in forward
  // order (each insertVueRoute call adds right after `routes: [`, pushing
  // earlier insertions down).
  insertVueRoute(host, projectRoot, options.project, {
    path: `${normalizedOptions.route}/:id/confirmation`,
    componentImportPath: `../views/${confirmationViewFileName}.vue`,
    requiresAuth: normalizedOptions.requiresAuth,
  });
  insertVueRoute(host, projectRoot, options.project, {
    path: `${normalizedOptions.route}/:id/review`,
    componentImportPath: `../views/${reviewViewFileName}.vue`,
    requiresAuth: normalizedOptions.requiresAuth,
    layout: 'form',
  });
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    insertVueRoute(host, projectRoot, options.project, {
      path: `${normalizedOptions.route}/:id/${step.key}`,
      componentImportPath: `../views/${stepViewFileName(step.key)}.vue`,
      requiresAuth: normalizedOptions.requiresAuth,
      layout: 'form',
    });
  }

  await formatFiles(host);
}
