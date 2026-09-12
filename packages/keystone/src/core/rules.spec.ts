// project-docs-ancestors: cli-designs:keystone-init

import {
  assessTarget,
  chooseRoute,
  declaredSet,
  floorAction,
  MODE_EXECUTABLE,
  MODE_REGULAR,
  placementMode,
} from './rules';
import { describe as render, nextCommand } from './refusal';

describe('declaredSet', () => {
  // req-005 rule 1: the universe is the source's tracked files, intersected with the source's own
  // predicate. Anything untracked is absent by construction, so the fixture only supplies tracked
  // paths and the predicate decides the rest.
  it('intersects the tracked files with the predicate', () => {
    const tracked = ['a.md', 'excluded/doc.md', 'kept/file.ts'];
    const travels = (p: string) => !p.startsWith('excluded/');

    expect(declaredSet(tracked, travels)).toEqual(['a.md', 'kept/file.ts']);
  });

  // req-005 rule 2: an excluded path does not travel; an exception named inside an excluded
  // directory does. Both answers come from the predicate, which is the point.
  it('keeps an exception inside an excluded directory', () => {
    const tracked = [
      'refs/history.md',
      'refs/contract.md',
      'refs/donor/example.md',
    ];
    const travels = (p: string) => p !== 'refs/history.md';

    expect(declaredSet(tracked, travels)).toEqual([
      'refs/contract.md',
      'refs/donor/example.md',
    ]);
  });

  // req-005 rule 3: the set is the source's answer. Same tracked files, a predicate that no longer
  // carries a path, and nothing about this package changed — the set differs.
  it('follows a changed predicate with no change to this package', () => {
    const tracked = ['keep.md', 'dropped.md'];

    expect(declaredSet(tracked, () => true)).toEqual(['dropped.md', 'keep.md']);
    expect(declaredSet(tracked, (p) => p !== 'dropped.md')).toEqual([
      'keep.md',
    ]);
  });

  it('sorts, so the reported set is comparable', () => {
    expect(declaredSet(['b/two.ts', 'a/one.ts'], () => true)).toEqual([
      'a/one.ts',
      'b/two.ts',
    ]);
  });

  // Deliberately NOT normalised: git ls-files emits forward slashes on every platform, so the only
  // input a backslash rewrite could apply to is a tracked filename that genuinely contains one —
  // which it would silently rename, after which the writer looks for it under the new name and
  // finds nothing.
  it('passes a path containing a backslash through unchanged', () => {
    expect(declaredSet(['odd\\name.ts'], () => true)).toEqual(['odd\\name.ts']);
  });
});

describe('placementMode', () => {
  // req-005 rule 4: the execute bit travels, so a placed hook is executable.
  it('places an executable source file executable', () => {
    expect(placementMode(0o755)).toBe(MODE_EXECUTABLE);
  });

  it('places a file with only the owner execute bit executable', () => {
    expect(placementMode(0o700)).toBe(MODE_EXECUTABLE);
  });

  it('places a non-executable source file non-executable', () => {
    expect(placementMode(0o644)).toBe(MODE_REGULAR);
  });

  // req-005 rule 7: the mode bits that travel are bounded. A wide source mode does not widen the
  // placed file — placement installs something that runs at every commit.
  it('narrows a world-writable executable to owner-write', () => {
    expect(placementMode(0o777)).toBe(MODE_EXECUTABLE);
  });

  it('drops setuid and setgid', () => {
    expect(placementMode(0o6755)).toBe(MODE_EXECUTABLE);
    expect(placementMode(0o6644)).toBe(MODE_REGULAR);
  });
});

describe('chooseRoute', () => {
  // req-006 rule 1 / rule 2: an explicitly given path is the local route, which reaches no network.
  it('takes the local route when a source path is given', () => {
    expect(chooseRoute({ source: '/tmp/clone', ref: null })).toEqual({
      route: { kind: 'local', path: '/tmp/clone' },
    });
  });

  // req-006 rule 8: with nothing given, the pinned repository's default branch. No option names
  // the repository on either route.
  it('takes the fetch route with no options at all', () => {
    expect(chooseRoute({ source: null, ref: null })).toEqual({
      route: { kind: 'fetch', ref: null },
    });
  });

  it('takes the fetch route with a ref', () => {
    expect(chooseRoute({ source: null, ref: 'v1.2.3' })).toEqual({
      route: { kind: 'fetch', ref: 'v1.2.3' },
    });
  });

  // req-006 rule 5: a ref selects among the pinned repository's commits and says nothing about
  // which commit a local tree is on, so a winner cannot be picked without deciding which of two
  // explicit instructions the caller meant.
  it('refuses a ref paired with a local source rather than letting one win', () => {
    const chosen = chooseRoute({ source: '/tmp/clone', ref: 'v1.2.3' });

    expect('usageError' in chosen).toBe(true);
  });
});

describe('assessTarget', () => {
  // req-005 rule 8: init refuses a target that already carries the harness and names upgrade.
  it('refuses a target that carries the harness, naming upgrade', () => {
    const refusal = assessTarget({
      target: '/tmp/project',
      carriesHarness: true,
      collisions: [],
    });

    if (!refusal) {
      throw new Error('expected a refusal');
    }
    expect(refusal.condition).toBe('target-carries-harness');
    expect(render(refusal)).toBe(
      '/tmp/project already carries the harness. To update it, run: keystone upgrade --target /tmp/project',
    );
    expect(nextCommand(refusal)).toBe('keystone upgrade --target /tmp/project');
  });

  // req-005 rule 6: placement refuses rather than overwriting a file it did not place, and the
  // message names THAT FILE rather than the condition — an agent cannot act on "target not empty".
  it('refuses on a collision and names the colliding path', () => {
    const refusal = assessTarget({
      target: '/tmp/project',
      carriesHarness: false,
      collisions: ['AGENTS.md'],
    });

    if (!refusal) {
      throw new Error('expected a refusal');
    }
    expect(refusal.condition).toBe('target-file-collision');
    expect(render(refusal)).toBe(
      '/tmp/project/AGENTS.md already exists and this placement would overwrite it. ' +
        'Placement will not overwrite a file it did not place.',
    );
    expect(nextCommand(refusal)).toBeNull();
  });

  // The third target state is keyed on collision, not on the directory being non-empty: a project
  // with files of its own is a legitimate placement target until one of them is in the way.
  it('permits a target that has files of its own but none in the way', () => {
    expect(
      assessTarget({
        target: '/tmp/project',
        carriesHarness: false,
        collisions: [],
      }),
    ).toBeNull();
  });

  it('reports the harness before a collision, since that target belongs to the update path', () => {
    const refusal = assessTarget({
      target: '/tmp/project',
      carriesHarness: true,
      collisions: ['AGENTS.md'],
    });

    expect(refusal?.condition).toBe('target-carries-harness');
  });
});

describe('floorAction', () => {
  // req-009 rule 1: a workspace has the generator that DEFINES the floor, so it is invoked rather
  // than reimplemented.
  it('defers to the suite generator where the target is a workspace', () => {
    expect(floorAction({ hasManifest: true, hasWorkspaceConfig: true })).toBe(
      'defer',
    );
  });

  // req-009 rule 2: the case an earlier version of the requirement missed entirely, because it
  // keyed on a conjunction and its full negation — an ordinary npm repository matched neither.
  it('wires into an existing manifest where there is no workspace', () => {
    expect(floorAction({ hasManifest: true, hasWorkspaceConfig: false })).toBe(
      'wire-existing-manifest',
    );
  });

  // req-009 rule 3: no generator can run here at all, which is why this is a published binary.
  it('wires and writes a manifest where there is neither', () => {
    expect(floorAction({ hasManifest: false, hasWorkspaceConfig: false })).toBe(
      'wire-and-write-manifest',
    );
  });

  it('treats a workspace config with no manifest as not a workspace, since nx needs both', () => {
    expect(floorAction({ hasManifest: false, hasWorkspaceConfig: true })).toBe(
      'wire-and-write-manifest',
    );
  });
});
