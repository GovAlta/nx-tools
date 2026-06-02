import { execFileSync } from 'child_process';
import { mocked } from 'jest-mock';
import { verifyConditions } from './verify-conditions';
import type { VerifyConditionsContext } from 'semantic-release';

jest.mock('child_process');
const mockedExecFileSync = mocked(execFileSync);

function makeContext(tags: { gitTag: string; channels: (string | null)[] }[]): VerifyConditionsContext {
  return {
    branch: { name: 'main', tags },
    cwd: '/repo',
    logger: { log: jest.fn(), error: jest.fn() },
  } as unknown as VerifyConditionsContext;
}

describe('verifyConditions', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  it('corrects channels from the tag-specific note', async () => {
    const tags = [{ gitTag: 'project-a@1.0.0', channels: [null] as (string | null)[] }];
    mockedExecFileSync.mockReturnValue(Buffer.from('{"channels":["next"]}'));

    await verifyConditions({} as any, makeContext(tags));

    expect(tags[0].channels).toEqual(['next']);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'git',
      ['notes', '--ref', 'semantic-release-project-a@1.0.0', 'show', 'project-a@1.0.0'],
      expect.objectContaining({ cwd: '/repo' })
    );
  });

  it('corrects channels for each tag independently', async () => {
    const tags = [
      { gitTag: 'project-a@1.0.0', channels: [null] as (string | null)[] },
      { gitTag: 'project-b@1.0.0', channels: [null] as (string | null)[] },
    ];
    mockedExecFileSync
      .mockReturnValueOnce(Buffer.from('{"channels":["next","null"]}'))
      .mockReturnValueOnce(Buffer.from('{"channels":["next"]}'));

    await verifyConditions({} as any, makeContext(tags));

    expect(tags[0].channels).toEqual(['next', 'null']);
    expect(tags[1].channels).toEqual(['next']);
  });

  it('leaves channels unchanged when no note exists for a tag', async () => {
    const tags = [{ gitTag: 'project-a@1.0.0', channels: [null] as (string | null)[] }];
    mockedExecFileSync.mockImplementation(() => {
      throw Object.assign(new Error('no note'), { status: 1 });
    });

    await verifyConditions({} as any, makeContext(tags));

    expect(tags[0].channels).toEqual([null]);
  });

  it('leaves channels unchanged when note content is invalid JSON', async () => {
    const tags = [{ gitTag: 'project-a@1.0.0', channels: ['next'] as (string | null)[] }];
    mockedExecFileSync.mockReturnValue(Buffer.from('not-valid-json'));

    await verifyConditions({} as any, makeContext(tags));

    expect(tags[0].channels).toEqual(['next']);
  });

  it('is a no-op when there are no tags', async () => {
    await verifyConditions({} as any, makeContext([]));

    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });
});
