import {
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { NormalizedSchema, Schema } from './schema';

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const { appsDir } = getWorkspaceLayout(host);
  
  return {
    ...options,
    appsDir
  }
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    '.',
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  
  const normalizedOptions = normalizeOptions(host, options);

  if (!host.exists('Directory.Build.props')) {
    addFiles(host, normalizedOptions);
    await formatFiles(host);
  }
}
