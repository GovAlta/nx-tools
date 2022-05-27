import {
  formatFiles,
  generateFiles,
  joinPathFragments,
  names,
  Tree,
  installPackagesTask,
  updateJson,
} from '@nrwl/devkit';
import { libraryGenerator } from '@nrwl/workspace/generators';

interface NewArticleSchemaOptions {
  title: string;
  projectName: string;
  excerpt?: string;
}

export default async function (host: Tree, schema: NewArticleSchemaOptions) {
  generateFiles(
    // virtual file system
    host,

    // the location where the template files are
    joinPathFragments(__dirname, './files'),

    // where the files should be generated
    './apps',

    // the variables to be substituted in the template
    {
      title: schema.title,
      projectName: schema.projectName,
      upcaseTitle: schema.title.charAt(0).toUpperCase() + schema.title.slice(1),
      allUpcaseTitle: schema.title.toUpperCase(),
      excerpt: schema.excerpt || '',
      tmpl: '',
      normalizedTitle: names(schema.title).fileName,
      creationDate: new Date().toISOString(),
    }
  );

  await libraryGenerator(host, { name: schema.title });
  await formatFiles(host);
  updateJson(host, 'package.json', (pkgJson) => {
    pkgJson.dependencies['react-redux'] = '7.2.5';
    pkgJson.dependencies['redux-saga'] = '1.1.3';
    pkgJson.dependencies['axios'] = '^0.21.4';
    pkgJson.dependencies['@abgov/react-components'] = '^3.4.0-beta.65';
    pkgJson.dependencies['react-tooltip'] = '^4.2.21';
    pkgJson.dependencies['redux-devtools-extension'] = '^2.13.9';
    return pkgJson;
  });
  return () => {
    installPackagesTask(host);
  };
}
