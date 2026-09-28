// project-docs-ancestors: cli-designs:keystone-init

import { existsSync } from 'fs';
import { join } from 'path';
import { wire } from './wire';
import { pinInstaller, writeProvenance } from './provenance';
import { readFileSync, writeFileSync } from 'fs';
import { makeTarget } from '../testing/fixture';

// Real filesystem and real git: the thing under test is what a project looks like afterwards.

jest.setTimeout(120000);

describe('wire', () => {
  it('initialises a git repository in a bare target', () => {
    const target = makeTarget();

    const result = wire(target);

    expect(result.gitInitialised).toBe(true);
    expect(existsSync(join(target, '.git'))).toBe(true);
  });

  it('does not initialise git when .git already exists', () => {
    const target = makeTarget();
    wire(target); // first call creates it

    const result = wire(target);

    expect(result.gitInitialised).toBe(false);
  });

  it('does not initialise git when noGit option is set', () => {
    const target = makeTarget();

    const result = wire(target, { noGit: true });

    expect(result.gitInitialised).toBe(false);
    expect(existsSync(join(target, '.git'))).toBe(false);
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
