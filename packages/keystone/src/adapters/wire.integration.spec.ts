// project-docs-ancestors: cli-designs:keystone-init

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { checkHooksPath, readTargetShape, wire } from './wire';
import { pinInstaller, writeProvenance } from './provenance';
import { git } from './git';
import { makeTarget } from '../testing/fixture';

// Real filesystem and real git: the thing under test is what a project looks like afterwards.

jest.setTimeout(120000);

describe('wire', () => {
  // req-009 rule 3 and rule 5. THE defect this package exists to remove, and it is invisible: the
  // hook file is present and looks installed while git will not run it.
  it('makes a bare target a repository with a wired, committed-re-appliable hook path', () => {
    const target = makeTarget();

    const result = wire(target);

    expect(result.gitInitialised).toBe(true);
    expect(git(['config', '--get', 'core.hooksPath'], target)).toBe('.husky');
    expect(result.floor).toBe('wired');

    // The re-apply step is the part that survives a clone: core.hooksPath lives in .git/config,
    // which is never committed, so without this every later clone has an inert hook.
    const manifest = JSON.parse(
      readFileSync(join(target, 'package.json'), 'utf-8'),
    );
    expect(manifest.scripts.prepare).toContain('core.hooksPath');
    expect(manifest.private).toBe(true);
  });

  it('adds the re-apply step to a manifest the target already had', () => {
    const target = makeTarget();
    writeFileSync(
      join(target, 'package.json'),
      JSON.stringify({ name: 'theirs' }),
    );

    wire(target);

    const manifest = JSON.parse(
      readFileSync(join(target, 'package.json'), 'utf-8'),
    );
    expect(manifest.name).toBe('theirs');
    expect(manifest.scripts.prepare).toContain('core.hooksPath');
  });

  it("leaves a prepare script the project already had, since it is the project's", () => {
    const target = makeTarget();
    writeFileSync(
      join(target, 'package.json'),
      JSON.stringify({ name: 'theirs', scripts: { prepare: 'husky' } }),
    );

    wire(target);

    const manifest = JSON.parse(
      readFileSync(join(target, 'package.json'), 'utf-8'),
    );
    expect(manifest.scripts.prepare).toBe('husky');
  });

  it('reads the three shapes that decide who wires the floor', () => {
    const bare = makeTarget();
    expect(readTargetShape(bare)).toEqual({
      hasManifest: false,
      hasWorkspaceConfig: false,
    });

    writeFileSync(join(bare, 'package.json'), '{}');
    expect(readTargetShape(bare)).toEqual({
      hasManifest: true,
      hasWorkspaceConfig: false,
    });

    writeFileSync(join(bare, 'nx.json'), '{}');
    expect(readTargetShape(bare)).toEqual({
      hasManifest: true,
      hasWorkspaceConfig: true,
    });
  });
});

describe('checkHooksPath', () => {
  // req-009 rule 4: repository-wide and single-valued, so replacing it disables whatever check the
  // team already had.
  it('refuses a target that already configures a different hook path', () => {
    const target = makeTarget();
    git(['init', '--quiet'], target);
    git(['config', 'core.hooksPath', '.githooks'], target);

    expect(checkHooksPath(target)).toEqual({
      condition: 'target-configures-hooks-path',
      target,
      value: '.githooks',
    });
  });

  it('permits an unset hook path, and one already set to ours', () => {
    const target = makeTarget();
    git(['init', '--quiet'], target);
    expect(checkHooksPath(target)).toBeNull();

    git(['config', 'core.hooksPath', '.husky'], target);
    expect(checkHooksPath(target)).toBeNull();
  });

  it('permits a target that is not a repository yet', () => {
    expect(checkHooksPath(makeTarget())).toBeNull();
  });
});

describe('provenance', () => {
  // Four fields, deliberately: the harness describes itself, and what it cannot derive is the ref
  // and commit it was fetched at, because a copy has no remote.
  const record = {
    repository: 'GovAlta-EMU/keystone',
    ref: null,
    commit: 'a'.repeat(40),
    installer: '@abgov/keystone@1.2.3',
  };

  it('writes the record where the target will commit it', () => {
    const target = makeTarget();

    writeProvenance(target, record);

    expect(
      JSON.parse(readFileSync(join(target, '.keystone/install.json'), 'utf-8')),
    ).toEqual(record);
  });

  // req-008 rule 5: that file belongs to the project's own configuration step, which refuses to
  // run if it already exists.
  it('does not create the config file the project configuration step owns', () => {
    const target = makeTarget();

    writeProvenance(target, record);

    expect(existsSync(join(target, '.keystone/install.json'))).toBe(true);
    expect(existsSync(join(target, '.keystone/project.json'))).toBe(false);
  });

  it('records the repository identity, never a URL where a credential could appear', () => {
    const written = writeProvenance(makeTarget(), record);

    expect(written.repository).toBe('GovAlta-EMU/keystone');
    expect(JSON.stringify(written)).not.toMatch(/https?:\/\//);
  });

  // req-008 rule 7: named in the manifest so the lockfile carries the version, which is not the
  // same as the harness depending on it.
  it('pins itself into a manifest, and leaves an existing pin alone', () => {
    const target = makeTarget();
    expect(pinInstaller(target, '1.2.3')).toBe(false); // no manifest

    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'p' }));
    expect(pinInstaller(target, '1.2.3')).toBe(true);
    expect(
      JSON.parse(readFileSync(join(target, 'package.json'), 'utf-8'))
        .devDependencies['@abgov/keystone'],
    ).toBe('^1.2.3');

    expect(pinInstaller(target, '9.9.9')).toBe(false);
  });
});
