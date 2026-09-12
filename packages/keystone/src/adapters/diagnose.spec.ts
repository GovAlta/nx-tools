// project-docs-ancestors: cli-designs:keystone-init

import { diagnose } from './diagnose';

// req-006 rule 7: a failure names the access required rather than relaying a transport error.
//
// Three rows, deliberately. An earlier version probed SSH and made authenticated API calls to tell
// "no access" from "no such repository" from "no such ref" across eight rows — a diagnostic
// subsystem inside a file-copier. These cover what a caller can act on; anything else is relayed
// honestly, which the rule's second example sanctions.

const FAKE = ['NOT', 'A', 'REAL', 'TOKEN'].join('_');

describe('diagnose', () => {
  it('names the access needed, and the commands that grant it', () => {
    const text = diagnose({
      command: 'git fetch origin main',
      output: 'fatal: could not read from remote repository',
    });

    // git and gh both exist on any machine running this suite, so the third row is what answers.
    expect(text).toMatch(/gh auth status/);
    expect(text).toMatch(/gh auth switch/);
    // The lesson this suite already paid for: status succeeding proves only that SOME account is
    // logged in, not that the active one can see the repository.
    expect(text).toMatch(/access to the harness source repository/);
  });

  it('redacts both the command and the output of anything it relays', () => {
    const text = diagnose({
      command: `git fetch https://u:${FAKE}@github.com/o/r.git`,
      output: `remote: https://u:${FAKE}@github.com/o/r.git rejected`,
    });

    expect(text).not.toContain(FAKE);
    expect(text).toMatch(/<redacted>/);
  });
});
