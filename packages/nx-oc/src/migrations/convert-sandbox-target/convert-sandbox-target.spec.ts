import {
  addProjectConfiguration,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import migration from './convert-sandbox-target';

// A representative slice of the old generated run-commands sandbox target.
function oldSandboxCommands(ns: string, database?: 'postgres' | 'mongo') {
  const ref = `ghcr.io/test-org/${ns}-app:sandbox`;
  return [
    ...(database === 'postgres'
      ? [`oc apply -f .openshift/sandbox/sandbox-postgres.yml -n ${ns}`]
      : []),
    ...(database === 'mongo'
      ? [`oc apply -f .openshift/sandbox/sandbox-mongodb.yml -n ${ns}`]
      : []),
    `npx nx build app --configuration production`,
    `podman build --platform=linux/amd64 -f .openshift/app/Dockerfile -t ${ref} .`,
    `podman push ${ref}`,
    `oc tag ${ref} app:sandbox --reference-policy=local -n ${ns}`,
    `n=0; until oc import-image app:sandbox --confirm -n ${ns}; do n=$((n+1)); [ $n -ge 5 ] && exit 1; sleep 3; done`,
  ];
}

describe('convert-sandbox-target migration', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('converts a run-commands sandbox target to the executor', async () => {
    addProjectConfiguration(tree, 'app', {
      root: 'apps/app',
      projectType: 'application',
      targets: {
        sandbox: {
          executor: 'nx:run-commands',
          options: { commands: oldSandboxCommands('my-ns'), parallel: false },
        },
      },
    });

    await migration(tree);

    const target = readProjectConfiguration(tree, 'app').targets.sandbox;
    expect(target.executor).toBe('@abgov/nx-oc:sandbox');
    expect(target.options).toEqual({
      sandboxProject: 'my-ns',
      registry: 'ghcr.io/test-org',
    });
  });

  it('recovers the database type from the old commands', async () => {
    addProjectConfiguration(tree, 'app', {
      root: 'apps/app',
      projectType: 'application',
      targets: {
        sandbox: {
          executor: 'nx:run-commands',
          options: { commands: oldSandboxCommands('my-ns', 'postgres') },
        },
      },
    });

    await migration(tree);

    expect(readProjectConfiguration(tree, 'app').targets.sandbox.options).toEqual({
      sandboxProject: 'my-ns',
      registry: 'ghcr.io/test-org',
      database: 'postgres',
    });
  });

  it('leaves an already-migrated executor target untouched', async () => {
    const executorTarget = {
      executor: '@abgov/nx-oc:sandbox',
      options: { sandboxProject: 'my-ns', registry: 'ghcr.io/test-org' },
    };
    addProjectConfiguration(tree, 'app', {
      root: 'apps/app',
      projectType: 'application',
      targets: { sandbox: executorTarget },
    });

    await migration(tree);

    expect(readProjectConfiguration(tree, 'app').targets.sandbox).toEqual(
      executorTarget
    );
  });

  it('ignores unrelated run-commands targets', async () => {
    const unrelated = {
      executor: 'nx:run-commands',
      options: { commands: ['echo hi'] },
    };
    addProjectConfiguration(tree, 'app', {
      root: 'apps/app',
      projectType: 'application',
      targets: { sandbox: unrelated },
    });

    await migration(tree);

    expect(readProjectConfiguration(tree, 'app').targets.sandbox).toEqual(
      unrelated
    );
  });
});
