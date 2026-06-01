import { exec as execCb } from 'child_process';
import { publish } from './publish';

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));
jest.mock('util', () => ({
  promisify: jest.fn((fn) => fn),
}));

const mockedExec = execCb as jest.MockedFunction<typeof execCb>;

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    cwd: '/project',
    env: { NUGET_API_KEY: 'test-key' },
    ...overrides,
  } as never;
}

describe('publish', () => {
  beforeEach(() => {
    mockedExec.mockReset();
    (mockedExec as unknown as jest.Mock).mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('builds dotnet nuget push command with *.nupkg glob', async () => {
    await publish({}, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('dotnet nuget push');
    expect(cmd).toContain('*.nupkg');
  });

  it('includes api-key from env when NUGET_API_KEY is set', async () => {
    await publish({}, makeContext({ env: { NUGET_API_KEY: 'my-key' } }));

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('--api-key my-key');
  });

  it('omits api-key args when NUGET_API_KEY is not set', async () => {
    await publish({}, makeContext({ env: {} }));

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).not.toContain('--api-key');
    expect(cmd).not.toContain('--symbol-api-key');
  });

  it('includes --source when provided', async () => {
    await publish({ source: 'https://nuget.example.com/v3/index.json' }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('--source https://nuget.example.com/v3/index.json');
  });

  it('includes --symbol-source when provided', async () => {
    await publish({ symbolSource: 'https://symbols.example.com' }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('--symbol-source https://symbols.example.com');
  });

  it('includes --skip-duplicate when set', async () => {
    await publish({ skipDuplicate: true }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('--skip-duplicate');
  });

  it('includes --timeout when provided', async () => {
    await publish({ timeout: 300 }, makeContext());

    const [cmd] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(cmd).toContain('--timeout 300');
  });

  it('resolves nupkgRoot relative to cwd', async () => {
    await publish({ nupkgRoot: 'artifacts' }, makeContext({ cwd: '/project' }));

    const [, options] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(options.cwd).toBe('/project/artifacts');
  });

  it('uses cwd directly when nupkgRoot is not set', async () => {
    await publish({}, makeContext({ cwd: '/project' }));

    const [, options] = (mockedExec as unknown as jest.Mock).mock.calls[0];
    expect(options.cwd).toBe('/project');
  });
});
