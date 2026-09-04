import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, logger } from '@nx/devkit';
import generator from './pin-ancestors';
import lineage from '../project-docs-lineage/project-docs-lineage';

describe('nx-agent pin-ancestors generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    host.write(
      'project-docs/domain-terms/a.md',
      ['---', 'term: A', '---', 'A body'].join('\n'),
    );
  });

  function writeDescendant(
    id: string,
    ancestors: string[],
    extra: string[] = [],
  ) {
    host.write(
      `project-docs/domain-terms/${id}.md`,
      [
        '---',
        `term: ${id}`,
        ...extra,
        'project-docs-ancestors:',
        ...ancestors.map((a) => `  - ${a}`),
        '---',
        `${id} body`,
      ].join('\n'),
    );
  }

  function refsOf(id: string): string[] {
    return host
      .read(`project-docs/domain-terms/${id}.md`, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().startsWith('- '))
      .map((l) => l.trim().slice(2));
  }

  it('adds the ancestor body digest to an unpinned reference', async () => {
    writeDescendant('b', ['domain-terms:a']);

    await generator(host);

    expect(refsOf('b')).toEqual([
      expect.stringMatching(/^domain-terms:a@[0-9a-f]{12}$/),
    ]);
  });

  it('produces a pin project-docs-lineage then reports as current', async () => {
    writeDescendant('b', ['domain-terms:a']);

    await generator(host);
    await lineage(host);

    const l = JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8'));
    expect(l.status.stale).toEqual([]);
  });

  it('refreshes a stale pin', async () => {
    writeDescendant('b', ['domain-terms:a@aaaaaaaaaaaa']);

    await generator(host);

    expect(refsOf('b')[0]).not.toContain('aaaaaaaaaaaa');
    await lineage(host);
    expect(
      JSON.parse(host.read('.nx-agent/lineage.json', 'utf-8')).status.stale,
    ).toEqual([]);
  });

  it('leaves a reference that does not resolve alone, rather than inventing provenance', async () => {
    writeDescendant('b', ['domain-terms:nonexistent']);

    await generator(host);

    expect(refsOf('b')).toEqual(['domain-terms:nonexistent']);
  });

  it('preserves a fragment while pinning', async () => {
    writeDescendant('b', ['domain-terms:a#some-section']);

    await generator(host);

    expect(refsOf('b')[0]).toMatch(
      /^domain-terms:a@[0-9a-f]{12}#some-section$/,
    );
  });

  it('scopes to one descendant with --artifact', async () => {
    writeDescendant('b', ['domain-terms:a']);
    writeDescendant('c', ['domain-terms:a']);

    await generator(host, { artifact: 'domain-terms:b' });

    expect(refsOf('b')[0]).toContain('@');
    expect(refsOf('c')).toEqual(['domain-terms:a']);
  });

  it('scopes to one ancestor with --ancestor', async () => {
    host.write(
      'project-docs/domain-terms/other.md',
      ['---', 'term: Other', '---', 'Other body'].join('\n'),
    );
    writeDescendant('b', ['domain-terms:a', 'domain-terms:other']);

    await generator(host, { ancestor: 'domain-terms:a' });

    const refs = refsOf('b');
    expect(refs[0]).toContain('domain-terms:a@');
    expect(refs[1]).toBe('domain-terms:other');
  });

  it('throws on a scope that is not a registered artifact', async () => {
    writeDescendant('b', ['domain-terms:a']);

    await expect(
      generator(host, { ancestor: 'domain-terms:typo' }),
    ).rejects.toThrow(/not a registered project-docs artifact/);
  });

  // resolves holds references too, but resolving an open question isn't a
  // derivation — the question's content moving doesn't invalidate the resolver.
  it('does not touch a resolves list', async () => {
    writeDescendant(
      'b',
      ['domain-terms:a'],
      ['resolves:', '  - domain-terms:a'],
    );

    await generator(host);

    const content = host.read('project-docs/domain-terms/b.md', 'utf-8');
    const resolvesBlock = content.slice(
      content.indexOf('resolves:'),
      content.indexOf('project-docs-ancestors:'),
    );
    expect(resolvesBlock).not.toContain('@');
  });

  it('is idempotent', async () => {
    writeDescendant('b', ['domain-terms:a']);

    await generator(host);
    const once = host.read('project-docs/domain-terms/b.md', 'utf-8');
    await generator(host);

    expect(host.read('project-docs/domain-terms/b.md', 'utf-8')).toBe(once);
  });

  // The generators emit both sequence styles: requirements write a block list,
  // domain-terms write a flow list. Handling only one silently skipped the
  // other, which reads exactly like a deliberately unpinned reference.
  describe('flow-style sequences', () => {
    function writeFlowDescendant(id: string, inner: string) {
      host.write(
        `project-docs/domain-terms/${id}.md`,
        [
          '---',
          `term: ${id}`,
          `project-docs-ancestors: [${inner}]`,
          'resolves: []',
          '---',
          `${id} body`,
        ].join('\n'),
      );
    }

    it('pins a single-item flow list', async () => {
      writeFlowDescendant('b', 'domain-terms:a');

      await generator(host);

      expect(host.read('project-docs/domain-terms/b.md', 'utf-8')).toMatch(
        /project-docs-ancestors: \[domain-terms:a@[0-9a-f]{12}\]/,
      );
    });

    it('pins every item in a multi-item flow list', async () => {
      host.write(
        'project-docs/domain-terms/other.md',
        ['---', 'term: Other', '---', 'Other body'].join('\n'),
      );
      writeFlowDescendant('b', 'domain-terms:a, domain-terms:other');

      await generator(host);

      // formatFiles reflows a multi-item flow list into block style, so assert
      // on the file rather than on the original single line.
      const content = host.read('project-docs/domain-terms/b.md', 'utf-8');
      expect(content).toMatch(/domain-terms:a@[0-9a-f]{12}/);
      expect(content).toMatch(/domain-terms:other@[0-9a-f]{12}/);
    });

    it('leaves an empty flow list alone', async () => {
      writeFlowDescendant('b', '');

      await generator(host);

      expect(host.read('project-docs/domain-terms/b.md', 'utf-8')).toContain(
        'project-docs-ancestors: []',
      );
    });

    it('does not treat a following resolves list as part of the ancestors list', async () => {
      writeFlowDescendant('b', 'domain-terms:a');

      await generator(host);

      expect(host.read('project-docs/domain-terms/b.md', 'utf-8')).toContain(
        'resolves: []',
      );
    });

    it('warns rather than silently skipping a form it cannot rewrite', async () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation();
      host.write(
        'project-docs/domain-terms/b.md',
        [
          '---',
          'term: b',
          'project-docs-ancestors:',
          '  - { weird: mapping }',
          '---',
          'b body',
        ].join('\n'),
      );

      await generator(host);

      expect(warn.mock.calls.flat().join('\n')).toContain('could not pin');
      warn.mockRestore();
    });
  });
});
