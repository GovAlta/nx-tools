import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree } from '@nx/devkit';
import {
  ensureArtifactSchemaEntry,
  readArtifactSchema,
} from './artifact-schema';

describe('readArtifactSchema', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('returns an empty object when the file does not exist', () => {
    expect(readArtifactSchema(host)).toEqual({});
  });

  it('reads an existing schema file', () => {
    host.write(
      'project-docs/artifact-schema.json',
      JSON.stringify({
        'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
      }),
    );

    expect(readArtifactSchema(host)).toEqual({
      'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
    });
  });
});

describe('ensureArtifactSchemaEntry', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('creates the file fresh with the given entry', () => {
    ensureArtifactSchemaEntry(host, 'bounded-contexts', []);

    expect(readArtifactSchema(host)).toEqual({
      'bounded-contexts': { expectedAncestorTypes: [] },
    });
  });

  it('merges a second type in without disturbing the first', () => {
    ensureArtifactSchemaEntry(host, 'bounded-contexts', []);
    ensureArtifactSchemaEntry(host, 'domain-terms', ['bounded-contexts']);

    expect(readArtifactSchema(host)).toEqual({
      'bounded-contexts': { expectedAncestorTypes: [] },
      'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
    });
  });

  it('overwrites its own entry on re-run without touching others', () => {
    ensureArtifactSchemaEntry(host, 'bounded-contexts', []);
    ensureArtifactSchemaEntry(host, 'domain-terms', ['bounded-contexts']);

    ensureArtifactSchemaEntry(host, 'domain-terms', [
      'bounded-contexts',
      'something-else',
    ]);

    expect(readArtifactSchema(host)).toEqual({
      'bounded-contexts': { expectedAncestorTypes: [] },
      'domain-terms': {
        expectedAncestorTypes: ['bounded-contexts', 'something-else'],
      },
    });
  });

  it('records tracksResolution when passed, and omits it when not', () => {
    ensureArtifactSchemaEntry(host, 'open-questions', [], true);
    ensureArtifactSchemaEntry(host, 'domain-terms', ['bounded-contexts']);

    expect(readArtifactSchema(host)).toEqual({
      'open-questions': { expectedAncestorTypes: [], tracksResolution: true },
      'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
    });
  });

  it('preserves a hand-added entry for a type nx-agent knows nothing about', () => {
    host.write(
      'project-docs/artifact-schema.json',
      JSON.stringify({
        requirements: { expectedAncestorTypes: ['bounded-contexts'] },
      }),
    );

    ensureArtifactSchemaEntry(host, 'domain-terms', ['bounded-contexts']);

    expect(readArtifactSchema(host)).toEqual({
      requirements: { expectedAncestorTypes: ['bounded-contexts'] },
      'domain-terms': { expectedAncestorTypes: ['bounded-contexts'] },
    });
  });
});
