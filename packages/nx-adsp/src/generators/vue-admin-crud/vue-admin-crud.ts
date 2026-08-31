import {
  formatFiles,
  generateFiles,
  names,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import * as path from 'path';
import { insertVueRoute } from '../../utils/vue-router';
import { insertSideMenuItem } from '../../utils/vue-side-menu';
import vueComponentsGenerator, {
  vueComponentsImportPath,
} from '../vue-components/vue-components';
import { AdminCrudField, NormalizedSchema, Schema } from './schema';

// Nx's own CLI option coercion (coerceTypesInOptions in nx/src/utils/params)
// only knows how to split an array-typed option on commas -- it has no JSON
// support, so a real `"type": "array"` schema for --fields silently mangles a
// JSON array into garbage fragments when invoked from the actual CLI (only
// programmatic callers, like this generator's own unit tests, ever pass a
// real array). --fields is `"type": "string"` in schema.json specifically so
// Nx leaves it alone, and this generator parses the JSON itself.
function parseFields(fields: Schema['fields']): AdminCrudField[] {
  const parsed = typeof fields === 'string' ? JSON.parse(fields) : fields;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      '--fields must be a non-empty JSON array of { key, label, type?, required? } objects.',
    );
  }
  return parsed;
}

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const { root: projectRoot } = readProjectConfiguration(host, options.project);

  const className = names(options.name).className;
  // className is PascalCase (e.g. "Regions") -- space it out for a readable
  // default heading ("Regions").
  const heading = options.heading ?? className.replace(/([A-Z])/g, ' $1').trim();
  return {
    ...options,
    projectRoot,
    fields: parseFields(options.fields),
    listViewFileName: `${className}ListView`,
    editViewFileName: `${className}EditView`,
    heading,
    singularLabel: options.singularLabel ?? heading,
    requiresAuth: options.requiresAuth ?? true,
  };
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = normalizeOptions(host, options);

  // Idempotent -- ensures WorkspaceTable exists even in a project scaffolded
  // before vue-components carried it.
  await vueComponentsGenerator(host);

  generateFiles(
    host,
    path.join(__dirname, 'files'),
    normalizedOptions.projectRoot,
    {
      ...normalizedOptions,
      goaImportPath: vueComponentsImportPath(host),
      tmpl: '',
    },
  );

  // The edit route also serves create: visiting `${route}/new` matches the
  // same `:id` param (id === 'new'), same convention the real reference
  // implementation this was modeled on uses -- no separate create route.
  insertVueRoute(host, normalizedOptions.projectRoot, normalizedOptions.project, {
    path: `${normalizedOptions.route}/:id`,
    componentImportPath: `../views/${normalizedOptions.editViewFileName}.vue`,
    requiresAuth: normalizedOptions.requiresAuth,
    layout: 'form',
  });
  insertVueRoute(host, normalizedOptions.projectRoot, normalizedOptions.project, {
    path: normalizedOptions.route,
    componentImportPath: `../views/${normalizedOptions.listViewFileName}.vue`,
    requiresAuth: normalizedOptions.requiresAuth,
    layout: 'wide',
  });

  // The list is the nav destination; the edit form is reached from it.
  insertSideMenuItem(host, normalizedOptions.projectRoot, {
    label: normalizedOptions.heading,
    to: normalizedOptions.route,
  });

  await formatFiles(host);
}
