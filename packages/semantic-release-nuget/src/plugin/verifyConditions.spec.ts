import { verifyConditions } from './verifyConditions';

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    env: { NUGET_API_KEY: 'test-key' },
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  } as never;
}

describe('verifyConditions', () => {
  it('resolves when project and NUGET_API_KEY are set', async () => {
    await expect(
      verifyConditions({ project: 'MyLib.csproj' }, makeContext()),
    ).resolves.toBeUndefined();
  });

  it('resolves when project is an array', async () => {
    await expect(
      verifyConditions({ project: ['Lib1.csproj', 'Lib2.csproj'] }, makeContext()),
    ).resolves.toBeUndefined();
  });

  it('resolves when NUGET_API_KEY is absent (warns instead of throwing)', async () => {
    const context = makeContext({ env: {} });
    await expect(
      verifyConditions({ project: 'MyLib.csproj' }, context),
    ).resolves.toBeUndefined();
    expect(
      (context as never as { logger: { warn: jest.Mock } }).logger.warn,
    ).toHaveBeenCalledWith(expect.stringContaining('NUGET_API_KEY'));
  });

  it('throws when project is not set', async () => {
    await expect(verifyConditions({} as never, makeContext())).rejects.toThrow('"project"');
  });

  it('throws when project array is empty', async () => {
    await expect(verifyConditions({ project: [] }, makeContext())).rejects.toThrow('"project"');
  });

  it('logs a confirmation message on success', async () => {
    const context = makeContext();
    await verifyConditions({ project: 'MyLib.csproj' }, context);
    expect((context as never as { logger: { log: jest.Mock } }).logger.log).toHaveBeenCalled();
  });
});
