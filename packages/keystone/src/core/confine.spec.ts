// project-docs-ancestors: cli-designs:keystone-init

import { confine, contains } from './confine';

describe('confine', () => {
  // req-005 rule 7: every written path is confined to the target. Three shapes, one decision.
  it('permits a path inside the target', () => {
    const result = confine('/tmp/target', 'nested/file.ts');

    expect(result.permitted).toBe(true);
  });

  it('refuses an absolute declared path', () => {
    expect(confine('/tmp/target', '/etc/passwd')).toEqual({
      permitted: false,
      reason: 'absolute',
    });
  });

  it('refuses an upward traversal', () => {
    expect(confine('/tmp/target', '../escaped/file.ts')).toEqual({
      permitted: false,
      reason: 'escapes',
    });
  });

  it('refuses a traversal that only escapes after normalisation', () => {
    expect(confine('/tmp/target', 'a/b/../../../out.ts')).toEqual({
      permitted: false,
      reason: 'escapes',
    });
  });

  it('refuses the target itself with its own reason, not as an escape', () => {
    expect(confine('/tmp/target', '.')).toEqual({
      permitted: false,
      reason: 'is-target',
    });
  });

  it('contains() answers for an already-resolved absolute path', () => {
    expect(contains('/tmp/target', '/tmp/target/nested/file.ts')).toBe(true);
    expect(contains('/tmp/target', '/tmp/elsewhere/file.ts')).toBe(false);
    expect(contains('/tmp/target', '/tmp/target')).toBe(false);
    // A sibling directory sharing a prefix is outside, which a naive startsWith would get wrong.
    expect(contains('/tmp/target', '/tmp/target-other/file.ts')).toBe(false);
  });
});
