import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { prepare } from './prepare';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));
jest.mock('util', () => ({
  promisify: jest.fn((fn) => fn),
}));

const mockedExecFile = execFileCb as jest.MockedFunction<typeof execFileCb>;

function makeContext(version = '1.2.3') {
  return {
    cwd: '/project',
    env: { NUGET_API_KEY: 'test-key' },
    logger: { log: jest.fn(), error: jest.fn() },
    nextRelease: { version },
  } as never;
}

describe('prepare', () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
    (mockedExecFile as unknown as jest.Mock).mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('invokes dotnet pack with required args', async () => {
    const config = { project: 'MyProject.csproj' };
    await prepare(config, makeContext());

    const [file, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(file).toBe('dotnet');
    expect(args).toContain('pack');
    expect(args).toContain('MyProject.csproj');
    expect(args).toContain('/p:Version=1.2.3');
    expect(args).toContain('/p:Configuration=Release');
  });

  it('uses custom configuration when provided', async () => {
    await prepare({ project: 'MyProject.csproj', configuration: 'Debug' }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(args).toContain('/p:Configuration=Debug');
  });

  it('includes --no-build when noBuild is true', async () => {
    await prepare({ project: 'MyProject.csproj', noBuild: true }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(args).toContain('--no-build');
  });

  it('omits --no-build when noBuild is false', async () => {
    await prepare({ project: 'MyProject.csproj', noBuild: false }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(args).not.toContain('--no-build');
  });

  it('includes --include-symbols when set', async () => {
    await prepare({ project: 'MyProject.csproj', includeSymbols: true }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(args).toContain('--include-symbols');
  });

  it('includes --include-source when set', async () => {
    await prepare({ project: 'MyProject.csproj', includeSource: true }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(args).toContain('--include-source');
  });

  it('includes --serviceable when set', async () => {
    await prepare({ project: 'MyProject.csproj', serviceable: true }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(args).toContain('--serviceable');
  });

  it('passes cwd from context', async () => {
    await prepare({ project: 'MyProject.csproj' }, makeContext());

    const [, , options] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(options.cwd).toBe('/project');
  });

  it('packs each project when project is an array', async () => {
    await prepare({ project: ['Lib1.csproj', 'Lib2.csproj'] }, makeContext());

    expect(mockedExecFile).toHaveBeenCalledTimes(2);
    expect((mockedExecFile as unknown as jest.Mock).mock.calls[0][1]).toContain('Lib1.csproj');
    expect((mockedExecFile as unknown as jest.Mock).mock.calls[1][1]).toContain('Lib2.csproj');
  });

  it('applies the same flags to every project in the array', async () => {
    await prepare(
      { project: ['Lib1.csproj', 'Lib2.csproj'], noBuild: true, configuration: 'Debug' },
      makeContext(),
    );

    for (const call of (mockedExecFile as unknown as jest.Mock).mock.calls) {
      expect(call[1]).toContain('--no-build');
      expect(call[1]).toContain('/p:Configuration=Debug');
    }
  });
});
