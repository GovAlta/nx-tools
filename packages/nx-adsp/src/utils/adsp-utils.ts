import {
  readJson,
  Tree
} from '@nrwl/devkit';
import { AdspConfiguration } from './adsp';

interface Package {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
export function hasDependency(host: Tree, dependency: string): boolean {
  const {
    dependencies,
    devDependencies
  }: Package = readJson(host, 'package.json');

  return !!dependencies[dependency] ||
    !!devDependencies[dependency];
}

export function getAdspConfiguration(
  host: Tree,
  { tenant, realm }: { tenant: string, realm?: string }
): AdspConfiguration {
  return {
    tenant,
    tenantRealm: realm,
    accessServiceUrl: 'https://access.alberta.ca',
    directoryServiceUrl: 'https://directory-service.adsp.alberta.ca',
  }
}
