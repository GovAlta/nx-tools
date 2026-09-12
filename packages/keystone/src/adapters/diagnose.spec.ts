// project-docs-ancestors: cli-designs:keystone-init

import { diagnose, Environment } from './diagnose';

// req-006 rule 7: a failure names the access required rather than relaying a transport error.
//
// Four rows, deliberately. An earlier version probed SSH and made authenticated API calls across
// eight rows — a diagnostic subsystem inside a file-copier. A later trim cut it to three and took
// one row too many with it, which is why the not-authenticated case is asserted here by name.

const FAKE = ['NOT', 'A', 'REAL', 'TOKEN'].join('_');

const failure = {
  command: 'git fetch origin main',
  output: 'fatal: could not read from remote repository',
};

const fullyEquipped: Environment = {
  gitPresent: true,
  ghPresent: true,
  ghAuthenticated: true,
};

describe('diagnose', () => {
  // git is what fetches, so its absence is the first thing worth saying — and the only row where
  // placing from a local clone is the real alternative.
  it('names git when git is absent', () => {
    const text = diagnose(failure, { ...fullyEquipped, gitPresent: false });

    expect(text).toMatch(/git is not on PATH/);
    expect(text).toMatch(/--source/);
  });

  it('names the GitHub CLI when it is absent', () => {
    const text = diagnose(failure, {
      ...fullyEquipped,
      ghPresent: false,
      ghAuthenticated: false,
    });

    expect(text).toMatch(/Install the GitHub CLI/);
    expect(text).toMatch(/gh auth setup-git/);
    // The failure is still relayed, because credentials can come from elsewhere entirely and then
    // the real cause is in that output.
    expect(text).toMatch(/could not read from remote/);
  });

  // THE row this file exists to protect. The wrong advice here is a dead end: `gh auth switch`
  // when no account is logged in sends someone looking for something that does not exist.
  it('says to log in, not to switch, when no account is authenticated', () => {
    const text = diagnose(failure, {
      ...fullyEquipped,
      ghAuthenticated: false,
    });

    expect(text).toMatch(/No GitHub account is authenticated/);
    expect(text).toMatch(/gh auth login/);
    expect(text).not.toMatch(/gh auth switch/);
  });

  // Measured in this very session: two accounts on one machine with complementary access, and the
  // active one lacking access to the harness source looks exactly like the repository not existing.
  it('names which account is active when one is logged in', () => {
    const text = diagnose(failure, fullyEquipped);

    expect(text).toMatch(/gh auth status/);
    expect(text).toMatch(/gh auth switch/);
    expect(text).toMatch(/access to the harness source repository/);
  });

  it('redacts both the command and the output of anything it relays', () => {
    const text = diagnose(
      {
        command: `git fetch https://u:${FAKE}@github.com/o/r.git`,
        output: `remote: https://u:${FAKE}@github.com/o/r.git rejected`,
      },
      fullyEquipped,
    );

    expect(text).not.toContain(FAKE);
    expect(text).toMatch(/<redacted>/);
  });
});
