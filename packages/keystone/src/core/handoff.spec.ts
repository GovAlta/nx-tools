// project-docs-ancestors: cli-designs:keystone-init

import { buildHandoff, CONFIGURATION_STEP } from './handoff';

describe('buildHandoff', () => {
  // req-010 rule 2: names the step and the directory a fresh session must be rooted in.
  it('names the declared step and the target', () => {
    const handoff = buildHandoff('/tmp/project', [
      'build',
      CONFIGURATION_STEP,
      'ship',
    ]);

    expect(handoff.kind).toBe('step');
    expect(handoff.text).toContain(`/${CONFIGURATION_STEP}`);
    expect(handoff.text).toContain('/tmp/project');
    expect(handoff.text).toMatch(/new session rooted/);
  });

  // The composition fix: init leaves every placed file untracked, and the harness's own upgrade
  // tool refuses a dirty tree — so without this the command init's refusal names cannot run.
  it('tells the caller to commit first, with the reason', () => {
    for (const steps of [[CONFIGURATION_STEP], []]) {
      const text = buildHandoff('/tmp/project', steps).text;

      expect(text).toMatch(/Commit this placement/);
      expect(text).toMatch(/keystone upgrade` will refuse until then/);
    }
  });

  // req-010 rule 4, and the defect this whole mechanism exists for: the hand-written installer
  // printed a command that had not existed for three months, because the name was in prose that
  // nothing checked.
  it('says so rather than guessing when the source declares no such step', () => {
    const handoff = buildHandoff('/tmp/project', ['build', 'ship']);

    expect(handoff.kind).toBe('no-step');
    expect(handoff.text).toMatch(/declares no configuration step/);
    expect(handoff.text).not.toContain(`/${CONFIGURATION_STEP}`);
  });

  it('says so when the source declares nothing at all', () => {
    expect(buildHandoff('/tmp/project', []).kind).toBe('no-step');
  });

  // req-010 rule 3: the handoff is read and run, and the declaration came from a fetched tree.
  it('refuses to print a declared name that is not a bare identifier', () => {
    const handoff = buildHandoff('/tmp/project', ['setup; rm -rf /']);

    expect(handoff.kind).toBe('no-step');
    expect(handoff.text).not.toContain('rm -rf');
  });
});
