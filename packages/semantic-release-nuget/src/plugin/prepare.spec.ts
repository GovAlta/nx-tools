import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { prepare } from './prepare';

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));
jest.mock('util', () => ({
  promisify: jest.fn((fn) => fn),
}));

const mockedExec = execCb as jest.MockedFunction<typeof execCb>;

function makeContext(version = '1.2.3') {
  return {
    cwd: '/project',
    env: { NUGET_API_KEY: 'test-key' },
    nextRelease: { version },
  } as never;
}

describe('prepare', () => {
  beforeEach(() => {
    mockedExec.mockReset();
    (mockedExec as unknown as jest.Mock).mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('builds dotnet pack command with required args', async () => {
    const config = { project: 'MyProject.csproj' };
    await prepare(config, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('dotnet pack');
    expect(cmd).toContain('MyProject.csproj');
    expect(cmd).toContain('/p:Version=1.2.3');
    expect(cmd).toContain('/p:Configuration=Release');
  });

  it('uses custom configuration when provided', async () => {
    await prepare({ project: 'MyProject.csproj', configuration: 'Debug' }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('/p:Configuration=Debug');
  });

  it('includes --no-build when noBuild is true', async () => {
    await prepare({ project: 'MyProject.csproj', noBuild: true }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('--no-build');
  });

  it('omits --no-build when noBuild is false', async () => {
    await prepare({ project: 'MyProject.csproj', noBuild: false }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).not.toContain('--no-build');
  });

  it('includes --include-symbols when set', async () => {
    await prepare({ project: 'MyProject.csproj', includeSymbols: true }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('--include-symbols');
  });

  it('includes --include-source when set', async () => {
    await prepare({ project: 'MyProject.csproj', includeSource: true }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('--include-source');
  });

  it('includes --serviceable when set', async () => {
    await prepare({ project: 'MyProject.csproj', serviceable: true }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('--serviceable');
  });

  it('passes cwd from context', async () => {
    await prepare({ project: 'MyProject.csproj' }, makeContext());

    const [, options] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(options.cwd).toBe('/project');
  });
});
