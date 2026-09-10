import { logger, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import migration from './parameterize-sandbox-image-tag';

// A verbatim capture of what the node-files template emitted for a
// postgres-backed sandbox app before the tag was parameterized: rendered
// through generateFiles and then formatFiles, which is what the generator does,
// so it matches the bytes a consuming workspace actually holds. (Prettier
// therefore leaves it alone — if a format run ever changes it, the capture has
// drifted from generator output, not the other way round.)
//
// Held as its own file rather than re-rendered from the live template: this
// migration must keep applying the same change to that old output forever, so a
// later template edit must not be able to change what these tests assert.
const PRE_FIX = readFileSync(
  join(__dirname, 'pre-fix-node.fixture.yml'),
  'utf8',
);

const MANIFEST = '.openshift/my-api/my-api.sandbox.yml';

function treeWith(files: Record<string, string>): Tree {
  const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  for (const [path, content] of Object.entries(files)) {
    tree.write(path, content);
  }
  return tree;
}

describe('parameterize-sandbox-image-tag migration', () => {
  it('declares IMAGE_TAG and repoints every sandbox image at it', async () => {
    const tree = treeWith({ [MANIFEST]: PRE_FIX });

    await migration(tree);
    const result = tree.read(MANIFEST, 'utf8');

    expect(result).toContain('  - name: IMAGE_TAG');
    expect(result).toContain('    value: sandbox');
    // The fixture has two: the drizzle migrate init container and the app container.
    expect(
      result.match(/image: [^\n]*\/my-api:\$\{IMAGE_TAG\}$/gm),
    ).toHaveLength(2);
    // No literal tag left behind — a half-converted manifest deploys the wrong
    // image just as silently as the unconverted one.
    expect(result).not.toMatch(/image: [^\n]*\/my-api:sandbox$/m);
    // The parameter has to land in `parameters:`, before `objects:` — oc process
    // rejects a ${IMAGE_TAG} reference whose parameter is declared nowhere.
    expect(result.indexOf('- name: IMAGE_TAG')).toBeLessThan(
      result.indexOf('objects:'),
    );
  });

  it('leaves unrelated content alone', async () => {
    const tree = treeWith({ [MANIFEST]: PRE_FIX });

    await migration(tree);
    const result = tree.read(MANIFEST, 'utf8');

    // The database name and the postgres secret references are a different
    // hard-coded-name problem; this migration must not touch them.
    expect(result).toContain(
      'postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@sandbox-postgres-rw:5432/my-api_sandbox',
    );
    expect(result).toContain('name: sandbox-postgres-app');
    expect(result).toContain('deployment-mode: sandbox');
    expect(result).toContain('- name: APP_NAME');
  });

  it('is idempotent', async () => {
    const tree = treeWith({ [MANIFEST]: PRE_FIX });

    await migration(tree);
    const once = tree.read(MANIFEST, 'utf8');
    await migration(tree);
    const twice = tree.read(MANIFEST, 'utf8');

    expect(twice).toEqual(once);
    expect(twice.match(/- name: IMAGE_TAG/g)).toHaveLength(1);
  });

  it('ignores the pipeline manifest a project can carry alongside', async () => {
    // Same project directory, no `deployment-mode: sandbox` label — this is the
    // `deployment`-generated manifest, which has its own DEPLOY_TAG parameter.
    const pipeline = PRE_FIX.replace(
      'deployment-mode: sandbox',
      'deployment-mode: pipeline',
    );
    const tree = treeWith({
      [MANIFEST]: PRE_FIX,
      '.openshift/my-api/my-api.yml': pipeline,
    });

    await migration(tree);

    expect(tree.read('.openshift/my-api/my-api.yml', 'utf8')).toEqual(pipeline);
    expect(tree.read(MANIFEST, 'utf8')).toContain('- name: IMAGE_TAG');
  });

  it('warns and skips a manifest it does not recognise, and reports it', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    // Sandbox-labelled, but the image line has been rewritten by hand, so the
    // migration cannot know which tag to repoint.
    const handEdited = PRE_FIX.replace(
      /image: image-registry[^\n]*\n/g,
      'image: ghcr.io/my-org/my-api:custom\n',
    );
    const tree = treeWith({ [MANIFEST]: handEdited });

    const result = await migration(tree);

    expect(tree.read(MANIFEST, 'utf8')).toEqual(handEdited);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(MANIFEST));
    expect(result?.nextSteps?.[0]).toContain(MANIFEST);
    expect(result?.agentContext?.[0]).toContain('IMAGE_TAG');
    warn.mockRestore();
  });

  it('does nothing when the workspace has no .openshift directory', async () => {
    const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });

    await expect(migration(tree)).resolves.toBeUndefined();
  });
});
