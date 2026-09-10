import { formatFiles, logger, Tree } from '@nx/devkit';

// Retrofits the IMAGE_TAG parameter into sandbox manifests generated before the
// tag was parameterized. Those bake the tag in as the literal `:sandbox`, so the
// executor's --imageTag pushed and imported one tag while the Deployment kept
// reading another — a deploy that silently ran the previously-imported image.
//
// Frozen literals, not imports from the deployment templates: a released
// migration has to keep applying the same change forever, and reading the live
// template would let a later edit there silently change what this migration does
// to an old workspace.
const IMAGE_LINE =
  /^(\s*)image: (image-registry\.openshift-image-registry\.svc:5000\/\$\{PROJECT\}\/[A-Za-z0-9._-]+):sandbox[ \t]*$/gm;

const PARAMETER_BLOCK = [
  '  - name: IMAGE_TAG',
  "    description: Image tag to deploy. Set by the sandbox executor's --imageTag.",
  '    displayName: Image Tag',
  '    value: sandbox',
  '    required: true',
].join('\n');

const OBJECTS_LINE = /^objects:[ \t]*$/m;

// Positive identification, rather than editing anything that happens to look
// close enough. `deployment-mode: sandbox` is the label only the sandbox branch
// of the deployment templates emits, so it distinguishes these from the
// pipeline-shaped manifest a project can carry alongside.
function isSandboxManifest(content: string): boolean {
  return (
    /^kind: Template[ \t]*$/m.test(content) &&
    /^\s{2}deployment-mode: sandbox[ \t]*$/m.test(content) &&
    /^parameters:[ \t]*$/m.test(content) &&
    OBJECTS_LINE.test(content)
  );
}

function sandboxManifestPaths(tree: Tree): string[] {
  const found: string[] = [];
  if (!tree.exists('.openshift')) return found;
  for (const dir of tree.children('.openshift')) {
    const projectDir = `.openshift/${dir}`;
    if (!tree.isFile(projectDir)) {
      for (const file of tree.children(projectDir)) {
        if (file.endsWith('.sandbox.yml')) {
          found.push(`${projectDir}/${file}`);
        }
      }
    }
  }
  return found;
}

export default async function (tree: Tree) {
  const skipped: string[] = [];
  const updated: string[] = [];

  for (const path of sandboxManifestPaths(tree)) {
    const content = tree.read(path, 'utf8');
    if (!content) continue;

    if (/^\s*-\s*name:\s*IMAGE_TAG\s*$/m.test(content)) {
      // Already parameterized — re-running is a no-op, not a second insertion.
      continue;
    }

    if (!isSandboxManifest(content)) {
      skipped.push(path);
      continue;
    }

    // Both halves or neither: a manifest with `${IMAGE_TAG}` in an object body
    // and no matching parameter declaration fails in `oc process`, which is
    // worse than the defect being fixed.
    IMAGE_LINE.lastIndex = 0;
    if (!IMAGE_LINE.test(content)) {
      skipped.push(path);
      continue;
    }

    IMAGE_LINE.lastIndex = 0;
    const withTag = content.replace(
      IMAGE_LINE,
      (_match, indent, image) => `${indent}image: ${image}:\${IMAGE_TAG}`,
    );
    tree.write(
      path,
      withTag.replace(OBJECTS_LINE, `${PARAMETER_BLOCK}\nobjects:`),
    );
    updated.push(path);
  }

  if (updated.length) {
    logger.info(
      `[nx-oc] Parameterized the sandbox image tag in ${updated.length} manifest(s): ${updated.join(', ')}`,
    );
  }

  if (!skipped.length) {
    await formatFiles(tree);
    return;
  }

  for (const path of skipped) {
    logger.warn(
      `[nx-oc] ${path} is not the shape this migration knows how to edit — left unchanged. ` +
        `Its Deployment still reads a hard-coded ':sandbox' tag, so --imageTag will be rejected by the executor.`,
    );
  }

  await formatFiles(tree);

  return {
    nextSteps: skipped.map(
      (path) =>
        `${path} was not updated: --imageTag will fail against it until it declares an IMAGE_TAG parameter. ` +
        `Regenerate it with \`nx g @abgov/nx-oc:sandbox <project>\`, or add the parameter by hand.`,
    ),
    agentContext: [
      `These sandbox manifests were skipped because they do not match the generated shape: ${skipped.join(', ')}. ` +
        `For each, add an \`IMAGE_TAG\` parameter to the template's \`parameters:\` list ` +
        `(description "Image tag to deploy. Set by the sandbox executor's --imageTag.", value "sandbox", required true) ` +
        `and change every container image ending in \`:sandbox\` to end in \`:\${IMAGE_TAG}\` instead. ` +
        `Both halves are required — a \`\${IMAGE_TAG}\` reference with no parameter declaration makes \`oc process\` fail. ` +
        `Preserve any other customisation in the file.`,
    ],
  };
}
