import {
  readJson, 
  Tree
} from '@nrwl/devkit';

interface Package {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
export function hasDependency(host: Tree, dependency: string) {
  const { 
    dependencies,
    devDependencies
  }: Package = readJson(host, 'package.json');

  return dependencies[dependency] || 
    devDependencies[dependency];
}
