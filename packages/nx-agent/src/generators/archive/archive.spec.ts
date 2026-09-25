// project-docs-ancestors: cli-designs:archive-generator
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import generator from './archive';

jest.setTimeout(30000);

// Write a minimal valid project-docs artifact to the virtual tree.
function writeArtifact(
  host: Tree,
  path: string,
  extras: Record<string, string> = {},
): void {
  const frontmatter = [
    '---',
    ...Object.entries(extras).map(([k, v]) => `${k}: ${v}`),
    'project-docs-ancestors: []',
    'resolves: []',
    '---',
  ].join('\n');
  host.write(path, frontmatter + '\n\nbody text\n');
}

// Write an artifact that references a parent (so the index edge exists).
function writeArtifactWithAncestor(
  host: Tree,
  path: string,
  ancestor: string,
): void {
  const frontmatter = [
    '---',
    `project-docs-ancestors: [${ancestor}]`,
    'resolves: []',
    '---',
  ].join('\n');
  host.write(path, frontmatter + '\n\nbody text\n');
}

describe('archive generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    // Ensure iteration-retrospectives is registered as terminal
    host.write(
      'project-docs/artifact-schema.json',
      JSON.stringify({
        features: { expectedAncestorTypes: [] },
        requirements: { expectedAncestorTypes: ['features'] },
        'iteration-retrospectives': {
          expectedAncestorTypes: [],
          terminal: true,
        },
      }),
    );
  });

  describe('pre-flight guards', () => {
    it('throws when featurePath does not exist', async () => {
      await expect(
        generator(host, {
          featurePath: 'project-docs/features/nope.md',
          archiveReason: 'deferred',
        }),
      ).rejects.toThrow(/does not exist/);
    });

    it('throws when featurePath is not under project-docs/', async () => {
      host.write('other/features/foo.md', '---\n---\n');
      await expect(
        generator(host, {
          featurePath: 'other/features/foo.md',
          archiveReason: 'deferred',
        }),
      ).rejects.toThrow(/project-docs/);
    });

    it('throws when featurePath is already in the archive', async () => {
      host.write('project-docs/archive/features/foo.md', '---\n---\n');
      await expect(
        generator(host, {
          featurePath: 'project-docs/archive/features/foo.md',
          archiveReason: 'deferred',
        }),
      ).rejects.toThrow(/already in the archive/);
    });

    it('throws when featurePath has more than two segments after project-docs/', async () => {
      host.write('project-docs/features/sub/foo.md', '---\n---\n');
      await expect(
        generator(host, {
          featurePath: 'project-docs/features/sub/foo.md',
          archiveReason: 'deferred',
        }),
      ).rejects.toThrow(/two path segments/);
    });

    it('throws when featurePath is not a features/ artifact', async () => {
      writeArtifact(host, 'project-docs/requirements/some-req.md');
      await expect(
        generator(host, {
          featurePath: 'project-docs/requirements/some-req.md',
          archiveReason: 'deferred',
        }),
      ).rejects.toThrow(/features\//);
    });

    it('throws when destination already exists', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      host.write('project-docs/archive/features/foo.md', '---\n---\n');
      await expect(
        generator(host, {
          featurePath: 'project-docs/features/foo.md',
          archiveReason: 'deferred',
        }),
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('single-file move — req-005', () => {
    it('moves the feature file to project-docs/archive/features/<id>.md', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');

      await generator(host, {
        featurePath: 'project-docs/features/foo.md',
        archiveReason: 'deferred',
      });

      expect(host.exists('project-docs/features/foo.md')).toBe(false);
      expect(host.exists('project-docs/archive/features/foo.md')).toBe(true);
    });

    it('injects archive-reason into existing frontmatter', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');

      await generator(host, {
        featurePath: 'project-docs/features/foo.md',
        archiveReason: 'deferred',
      });

      const content = host.read('project-docs/archive/features/foo.md', 'utf-8') ?? '';
      expect(content).toContain('archive-reason: deferred');
    });

    it('injects archive-reason: completed when archiveReason is completed', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      // Add a terminal descendant so completeness guard passes
      writeArtifactWithAncestor(
        host,
        'project-docs/iteration-retrospectives/foo-retro.md',
        'features:foo',
      );

      await generator(host, {
        featurePath: 'project-docs/features/foo.md',
        archiveReason: 'completed',
      });

      const content = host.read('project-docs/archive/features/foo.md', 'utf-8') ?? '';
      expect(content).toContain('archive-reason: completed');
    });

    it('deletes the source file after writing the archive copy', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      await generator(host, {
        featurePath: 'project-docs/features/foo.md',
        archiveReason: 'deferred',
      });
      expect(host.exists('project-docs/features/foo.md')).toBe(false);
    });
  });

  describe('subtree walk — req-006', () => {
    it('archives transitive descendants before the feature itself', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      writeArtifactWithAncestor(
        host,
        'project-docs/requirements/bar.md',
        'features:foo',
      );

      await generator(host, {
        featurePath: 'project-docs/features/foo.md',
        archiveReason: 'deferred',
      });

      expect(host.exists('project-docs/features/foo.md')).toBe(false);
      expect(host.exists('project-docs/requirements/bar.md')).toBe(false);
      expect(host.exists('project-docs/archive/features/foo.md')).toBe(true);
      expect(host.exists('project-docs/archive/requirements/bar.md')).toBe(true);
    });

    it('injects archive-reason into each archived descendant', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      writeArtifactWithAncestor(
        host,
        'project-docs/requirements/bar.md',
        'features:foo',
      );

      await generator(host, {
        featurePath: 'project-docs/features/foo.md',
        archiveReason: 'deferred',
      });

      const req = host.read('project-docs/archive/requirements/bar.md', 'utf-8') ?? '';
      expect(req).toContain('archive-reason: deferred');
    });

    it('leaves a shared descendant in place', async () => {
      // requirements/shared.md lists both features as ancestors
      writeArtifact(host, 'project-docs/features/foo.md');
      writeArtifact(host, 'project-docs/features/bar.md');
      const sharedContent = [
        '---',
        'project-docs-ancestors: [features:foo, features:bar]',
        'resolves: []',
        '---',
        '',
        'body',
        '',
      ].join('\n');
      host.write('project-docs/requirements/shared.md', sharedContent);

      await generator(host, {
        featurePath: 'project-docs/features/foo.md',
        archiveReason: 'deferred',
      });

      // foo archived, shared requirement stays active
      expect(host.exists('project-docs/features/foo.md')).toBe(false);
      expect(host.exists('project-docs/archive/features/foo.md')).toBe(true);
      expect(host.exists('project-docs/requirements/shared.md')).toBe(true);
      expect(host.exists('project-docs/archive/requirements/shared.md')).toBe(false);
    });
  });

  describe('completeness guard — req-007', () => {
    it('throws for completed when a non-shared descendant has no terminal artifact', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      writeArtifactWithAncestor(
        host,
        'project-docs/requirements/bar.md',
        'features:foo',
      );
      // No iteration-retrospective — completeness guard should fire

      await expect(
        generator(host, {
          featurePath: 'project-docs/features/foo.md',
          archiveReason: 'completed',
        }),
      ).rejects.toThrow(/completeness guard failed/);
    });

    it('lists every incomplete descendant in the error message', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      writeArtifactWithAncestor(
        host,
        'project-docs/requirements/bar.md',
        'features:foo',
      );
      writeArtifactWithAncestor(
        host,
        'project-docs/requirements/baz.md',
        'features:foo',
      );

      await expect(
        generator(host, {
          featurePath: 'project-docs/features/foo.md',
          archiveReason: 'completed',
        }),
      ).rejects.toThrow(/requirements:bar[\s\S]*requirements:baz|requirements:baz[\s\S]*requirements:bar/);
    });

    it('does not run the guard when archiveReason is deferred', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      writeArtifactWithAncestor(
        host,
        'project-docs/requirements/bar.md',
        'features:foo',
      );
      // No retro — would fail completeness, but should not for deferred

      await expect(
        generator(host, {
          featurePath: 'project-docs/features/foo.md',
          archiveReason: 'deferred',
        }),
      ).resolves.not.toThrow();

      expect(host.exists('project-docs/archive/features/foo.md')).toBe(true);
    });

    it('passes for completed when all descendants have a terminal artifact', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      writeArtifactWithAncestor(
        host,
        'project-docs/requirements/bar.md',
        'features:foo',
      );
      writeArtifactWithAncestor(
        host,
        'project-docs/iteration-retrospectives/foo-retro.md',
        'requirements:bar',
      );

      await expect(
        generator(host, {
          featurePath: 'project-docs/features/foo.md',
          archiveReason: 'completed',
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('project-scoped paths — archiveDestination preserves prefix', () => {
    it('archives a scoped feature to the correct archive path under its project root', async () => {
      addProjectConfiguration(host, 'my-app', { root: 'apps/my-app', targets: {} });
      // Simulate a project-scoped project-docs tree
      host.write(
        'apps/my-app/project-docs/features/bar.md',
        [
          '---',
          'project-docs-ancestors: []',
          'resolves: []',
          '---',
          '',
          'body',
          '',
        ].join('\n'),
      );

      await generator(host, {
        featurePath: 'apps/my-app/project-docs/features/bar.md',
        archiveReason: 'deferred',
      });

      expect(host.exists('apps/my-app/project-docs/features/bar.md')).toBe(false);
      expect(host.exists('apps/my-app/project-docs/archive/features/bar.md')).toBe(true);
      // Must NOT appear under the workspace-root archive
      expect(host.exists('project-docs/archive/features/bar.md')).toBe(false);
    });
  });

  describe('no partial moves on pre-flight failure', () => {
    it('makes no changes when the completeness guard fails', async () => {
      writeArtifact(host, 'project-docs/features/foo.md');
      writeArtifactWithAncestor(
        host,
        'project-docs/requirements/bar.md',
        'features:foo',
      );

      await expect(
        generator(host, {
          featurePath: 'project-docs/features/foo.md',
          archiveReason: 'completed',
        }),
      ).rejects.toThrow();

      // Neither file should have moved
      expect(host.exists('project-docs/features/foo.md')).toBe(true);
      expect(host.exists('project-docs/requirements/bar.md')).toBe(true);
      expect(host.exists('project-docs/archive/features/foo.md')).toBe(false);
    });
  });
});
