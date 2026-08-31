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
import {
  NormalizedSchema,
  Schema,
  WorkspaceViewColumn,
  WorkspaceViewFilter,
} from './schema';

// Nx's own CLI option coercion (coerceTypesInOptions in nx/src/utils/params)
// only knows how to split an array-typed option on commas -- it has no JSON
// support, so a real `"type": "array"` schema for --columns silently mangles
// a JSON array into garbage fragments when invoked from the actual CLI (only
// programmatic callers, like this generator's own unit tests, ever pass a
// real array). --columns is `"type": "string"` in schema.json specifically so
// Nx leaves it alone, and this generator parses the JSON itself.
function parseColumns(columns: Schema['columns']): WorkspaceViewColumn[] {
  const parsed = typeof columns === 'string' ? JSON.parse(columns) : columns;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      '--columns must be a non-empty JSON array of { key, label, type?, sortable? } objects.',
    );
  }
  return parsed;
}

// Same JSON-string-on-the-CLI reasoning as parseColumns above.
function parseFilters(filters: Schema['filters']): WorkspaceViewFilter[] {
  if (filters === undefined || filters === '') return [];
  const parsed = typeof filters === 'string' ? JSON.parse(filters) : filters;
  if (!Array.isArray(parsed)) {
    throw new Error(
      '--filters must be a JSON array of { key, label, type: "dropdown"|"date", options?, anyLabel? } objects.',
    );
  }
  for (const filter of parsed) {
    if (filter.type !== 'dropdown' && filter.type !== 'date') {
      throw new Error(
        `--filters[].type must be "dropdown" or "date"; got "${filter.type}" for "${filter.key}".`,
      );
    }
  }
  return parsed;
}

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const { root: projectRoot } = readProjectConfiguration(host, options.project);

  const className = names(options.name).className;
  return {
    ...options,
    projectRoot,
    columns: parseColumns(options.columns),
    filters: parseFilters(options.filters),
    viewFileName: `${className}ListView`,
    // className is PascalCase (e.g. "Applications") -- space it out for a
    // readable default heading ("Applications").
    heading: options.heading ?? className.replace(/([A-Z])/g, ' $1').trim(),
    pageSize: options.pageSize ?? 20,
    filterable: options.filterable ?? true,
    requiresAuth: options.requiresAuth ?? true,
    // EJS's `with` binding only exposes keys that exist on the options object --
    // when --detailRoute is omitted, the key is absent (not undefined), so the
    // template's `<% if (detailRoute) %>` throws a ReferenceError without this.
    detailRoute: options.detailRoute ?? null,
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

  insertVueRoute(host, normalizedOptions.projectRoot, normalizedOptions.project, {
    path: normalizedOptions.route,
    componentImportPath: `../views/${normalizedOptions.viewFileName}.vue`,
    requiresAuth: normalizedOptions.requiresAuth,
    // A multi-column table at the 1000px default wraps every cell.
    layout: 'wide',
  });

  await formatFiles(host);
}
