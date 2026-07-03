import {
  getProjects,
  logger,
  Tree,
  updateProjectConfiguration,
} from '@nx/devkit';

// Converts sandbox targets generated as raw `nx:run-commands` command lists into
// the `@abgov/nx-oc:sandbox` executor, so the versioned deploy logic (import
// retry, preflight, resume flags) applies without re-running the generator.
//
// sandboxProject and registry are recovered from the old command strings; the
// app type is left to the executor to detect at run time.
export default async function convertSandboxTarget(tree: Tree): Promise<void> {
  let converted = 0;

  for (const [name, project] of getProjects(tree)) {
    const target = project.targets?.['sandbox'];
    if (!target || target.executor !== 'nx:run-commands') continue;

    const commands: string[] = Array.isArray(target.options?.commands)
      ? target.options.commands
      : [];
    const joined = commands.join('\n');
    // Only touch the sandbox target this plugin generated (podman build + import).
    if (!/podman build/.test(joined) || !/oc import-image/.test(joined)) continue;

    const namespace = joined.match(/-n\s+(\S+)/)?.[1];
    const imageRef = joined.match(/podman build[^\n]*?-t\s+(\S+)/)?.[1];
    if (!namespace || !imageRef) {
      logger.warn(
        `[nx-oc] Could not parse the sandbox target for "${name}"; leaving it as run-commands. Re-run the sandbox generator to migrate it.`
      );
      continue;
    }
    // imageRef is <registry>/<namespace>-<project>:<tag>; the registry is
    // everything before the final path segment (it contains its own slash,
    // e.g. ghcr.io/org).
    const registry = imageRef.slice(0, imageRef.lastIndexOf('/'));
    const database = /sandbox-postgres/.test(joined)
      ? 'postgres'
      : /sandbox-mongodb/.test(joined)
      ? 'mongo'
      : undefined;

    project.targets['sandbox'] = {
      executor: '@abgov/nx-oc:sandbox',
      options: {
        sandboxProject: namespace,
        registry,
        ...(database ? { database } : {}),
      },
    };
    updateProjectConfiguration(tree, name, project);
    converted++;
  }

  if (converted > 0) {
    logger.info(
      `[nx-oc] Converted ${converted} sandbox target(s) to the @abgov/nx-oc:sandbox executor.`
    );
  }
}
