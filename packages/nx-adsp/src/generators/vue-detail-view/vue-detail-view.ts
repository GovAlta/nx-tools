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
import { DetailViewField, NormalizedSchema, Schema } from './schema';

// Nx's own CLI option coercion (coerceTypesInOptions in nx/src/utils/params)
// only knows how to split an array-typed option on commas -- it has no JSON
// support, so a real `"type": "array"` schema for --fields silently mangles
// a JSON array into garbage fragments when invoked from the actual CLI (only
// programmatic callers, like this generator's own unit tests, ever pass a
// real array). --fields is `"type": "string"` in schema.json specifically so
// Nx leaves it alone, and this generator parses the JSON itself.
function parseFields(fields: Schema['fields']): DetailViewField[] {
  const parsed = typeof fields === 'string' ? JSON.parse(fields) : fields;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      '--fields must be a non-empty JSON array of { key, label, type? } objects.',
    );
  }
  return parsed;
}

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const { root: projectRoot } = readProjectConfiguration(host, options.project);

  if (!options.route.includes(':id')) {
    throw new Error(
      `--route "${options.route}" has no :id param -- the generated view reads route.params.id to fetch the record.`,
    );
  }

  const className = names(options.name).className;
  return {
    ...options,
    projectRoot,
    fields: parseFields(options.fields),
    viewFileName: `${className}View`,
    // className is PascalCase (e.g. "ApplicationDetail") -- space it out for a
    // readable default heading ("Application Detail").
    heading: options.heading ?? className.replace(/([A-Z])/g, ' $1').trim(),
    requiresAuth: options.requiresAuth ?? true,
  };
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = normalizeOptions(host, options);

  // Idempotent -- ensures RecordDetailShell exists even in a project scaffolded
  // before vue-components carried it.
  await vueComponentsGenerator(host);

  generateFiles(
    host,
    path.join(__dirname, 'files'),
    normalizedOptions.projectRoot,
    {
      ...normalizedOptions,
      goaImportPath: vueComponentsImportPath(host),
      // Derived here, not tested inline: EJS throws a ReferenceError on a bare
      // undefined variable, so a flag the template reads must always be defined.
      hasCodedFields: normalizedOptions.fields.some(
        (field) => field.options?.length,
      ),
      hasBadgeFields: normalizedOptions.fields.some(
        (field) => field.type === 'badge',
      ),
      tmpl: '',
    },
  );

  insertVueRoute(
    host,
    normalizedOptions.projectRoot,
    normalizedOptions.project,
    {
      path: normalizedOptions.route,
      componentImportPath: `../views/${normalizedOptions.viewFileName}.vue`,
      requiresAuth: normalizedOptions.requiresAuth,
    },
  );

  await formatFiles(host);
}
