// project-docs-ancestors: domain-models:lineage-graph-metadata
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { readArtifactSchema } from '../../utils/artifact-schema';
import generator from './requirement';

describe('nx-agent requirement generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the requirement file with the correct empty frontmatter shape', async () => {
    await generator(host, { title: 'Create an evaluation matrix' });

    const content = host
      .read('project-docs/requirements/create-an-evaluation-matrix.md')
      .toString();
    expect(content).toContain('title: Create an evaluation matrix');
    expect(content).toContain('id: req-001');
    expect(content).toContain('rules: []');
    expect(content).toContain('questions: []');
    expect(content).toContain('project-docs-ancestors: []');
    expect(content).toContain('resolves: []');
  });

  it('assigns req-001 when no existing requirements have a req-NNN id', async () => {
    await generator(host, { title: 'First requirement' });

    const content = host
      .read('project-docs/requirements/first-requirement.md')
      .toString();
    expect(content).toContain('id: req-001');
  });

  it('assigns the next unused id after scanning existing requirement files', async () => {
    // Seed two existing requirements with req-001 and req-002
    host.write(
      'project-docs/requirements/existing-one.md',
      ['---', 'title: Existing one', 'id: req-001', '---'].join('\n'),
    );
    host.write(
      'project-docs/requirements/existing-two.md',
      ['---', 'title: Existing two', 'id: req-002', '---'].join('\n'),
    );

    await generator(host, { title: 'New requirement' });

    const content = host
      .read('project-docs/requirements/new-requirement.md')
      .toString();
    expect(content).toContain('id: req-003');
  });

  it('assigns the next id after the highest existing numeric suffix, skipping gaps', async () => {
    // Gap: req-001 and req-003 exist — next should be req-004
    host.write(
      'project-docs/requirements/req-one.md',
      ['---', 'title: Req one', 'id: req-001', '---'].join('\n'),
    );
    host.write(
      'project-docs/requirements/req-three.md',
      ['---', 'title: Req three', 'id: req-003', '---'].join('\n'),
    );

    await generator(host, { title: 'New requirement' });

    const content = host
      .read('project-docs/requirements/new-requirement.md')
      .toString();
    expect(content).toContain('id: req-004');
  });

  it('derives the slug from a multi-word title', async () => {
    await generator(host, {
      title: 'Define qualification criteria for a matrix',
    });

    expect(
      host.exists(
        'project-docs/requirements/define-qualification-criteria-for-a-matrix.md',
      ),
    ).toBe(true);
  });

  it('throws and makes no changes when the requirement file already exists', async () => {
    await generator(host, { title: 'Create matrix' });
    const before = host
      .read('project-docs/requirements/create-matrix.md')
      .toString();

    await expect(
      generator(host, { title: 'Create matrix' }),
    ).rejects.toThrow(/already exists/);

    expect(
      host.read('project-docs/requirements/create-matrix.md').toString(),
    ).toBe(before);
  });

  it('resolves --projectDocsAncestors paths into the canonical reference', async () => {
    host.write(
      'project-docs/service-descriptions/candidate-evaluation.md',
      ['---', 'service: Candidate Evaluation', '---'].join('\n'),
    );

    await generator(host, {
      title: 'Create evaluation matrix',
      projectDocsAncestors: [
        'project-docs/service-descriptions/candidate-evaluation.md',
      ],
    });

    const content = host
      .read('project-docs/requirements/create-evaluation-matrix.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [service-descriptions:candidate-evaluation]',
    );
  });

  it('throws before any write when a --projectDocsAncestors path does not resolve', async () => {
    await expect(
      generator(host, {
        title: 'Create evaluation matrix',
        projectDocsAncestors: [
          'project-docs/service-descriptions/does-not-exist.md',
        ],
      }),
    ).rejects.toThrow(/not found/);

    expect(
      host.exists('project-docs/requirements/create-evaluation-matrix.md'),
    ).toBe(false);
    expect(host.exists('project-docs/requirements/README.md')).toBe(false);
  });

  it('creates the container README on first run', async () => {
    await generator(host, { title: 'Create matrix' });

    const readme = host
      .read('project-docs/requirements/README.md')
      .toString();
    expect(readme).toContain('# Requirements');
    expect(readme).toContain('nx g @abgov/nx-agent:requirement');
  });

  it('does not overwrite the README when a second requirement is added', async () => {
    await generator(host, { title: 'Create matrix' });
    const readmeBefore = host
      .read('project-docs/requirements/README.md')
      .toString();

    await generator(host, { title: 'Define criteria' });

    const readmeAfter = host
      .read('project-docs/requirements/README.md')
      .toString();
    expect(readmeAfter).toBe(readmeBefore);
  });

  it('registers requirements with expectedAncestorTypes service-descriptions in artifact-schema.json', async () => {
    await generator(host, { title: 'Create matrix' });

    expect(readArtifactSchema(host)).toMatchObject({
      requirements: { expectedAncestorTypes: ['service-descriptions'] },
    });
  });

  it('does not overwrite an existing requirements entry in artifact-schema.json', async () => {
    // Pre-existing entry (e.g. from a previous run or hand-authored)
    host.write(
      'project-docs/artifact-schema.json',
      JSON.stringify({
        requirements: { expectedAncestorTypes: ['service-descriptions'] },
        'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
      }),
    );

    await generator(host, { title: 'Create matrix' });

    const schema = readArtifactSchema(host);
    expect(schema['domain-terms']).toEqual({
      expectedAncestorTypes: ['bounded-contexts'],
    });
  });

  it('scopes the requirement file under a specific project when --project is given', async () => {
    addProjectConfiguration(host, 'domain-lib', {
      root: 'libs/domain-lib',
      projectType: 'library',
      targets: {},
    });

    await generator(host, { title: 'Create matrix', project: 'domain-lib' });

    expect(
      host.exists('libs/domain-lib/project-docs/requirements/create-matrix.md'),
    ).toBe(true);
    expect(host.exists('project-docs/requirements/create-matrix.md')).toBe(
      false,
    );
  });

  it('writes the resolved ref into both project-docs-ancestors and resolves, and confirms it', async () => {
    host.write(
      'project-docs/open-questions/what-to-call-this.md',
      ['---', 'project-docs-ancestors: []', 'resolves: []', '---'].join('\n'),
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await generator(host, {
      title: 'Create matrix',
      resolves: ['project-docs/open-questions/what-to-call-this.md'],
    });

    const content = host
      .read('project-docs/requirements/create-matrix.md')
      .toString();
    expect(content).toContain(
      'project-docs-ancestors: [open-questions:what-to-call-this]',
    );
    expect(content).toContain(
      'resolves: [open-questions:what-to-call-this]',
    );
    expect(logSpy).toHaveBeenCalledWith(
      '✓ this requirement resolves open-questions:what-to-call-this',
    );
    logSpy.mockRestore();
  });
});
