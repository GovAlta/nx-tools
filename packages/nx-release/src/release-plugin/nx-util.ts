import { execFile } from 'child_process';
import { readFile } from 'fs';
import { resolve } from 'path';
import { promisify } from 'util';

interface ProjectNode {
  data: {
    root: string
  }
}

interface Dependency {
  type: 'static' | 'implicit';
  target: string;
}

interface DependencyGraph {
  nodes: Record<string, ProjectNode>;
  dependencies: Record<string, Dependency[]>;
}

let paths: Record<string, string[]> = {};

export function clearCache(): void {
  paths = {};
}

export const getProjectChangePaths = async (cwd: string, project: string) => {
  if (!paths[project]) {
    const file = resolve(cwd, `tmp/${project}-deps.json`);
    await promisify(execFile)('npx', ['nx', 'graph', '--focus', project, '--file', file]);
  
    const result = await promisify(readFile)(file, 'utf8');
    const { graph }: { graph: DependencyGraph } = JSON.parse(result);
  
    // Include the project's root as well as the roots of all its dependencies.
    paths[project] = [
      graph.nodes[project].data.root,
      ...graph.dependencies[project]
        .map(d => 
          d.type === 'static' ? 
            graph.nodes[d.target].data.root : null
        )
        .filter(d => !!d)
    ];
  }

  return paths[project];
}
