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
  { tenant }: { tenant: string }
): AdspConfiguration {
  return {
    tenant,
    tenantRealm: tenant,
    accessServiceUrl: 'https://access.alpha.alberta.ca'
  }
}
