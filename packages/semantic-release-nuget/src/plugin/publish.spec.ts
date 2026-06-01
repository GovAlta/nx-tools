import { execFile as execFileCb } from 'child_process';
import { publish } from './publish';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));
jest.mock('util', () => ({
  promisify: jest.fn((fn) => fn),
}));

const mockedExecFile = execFileCb as jest.MockedFunction<typeof execFileCb>;

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    cwd: '/project',
    env: { NUGET_API_KEY: 'test-key' },
    ...overrides,
  } as never;
}

describe('publish', () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
    (mockedExecFile as unknown as jest.Mock).mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('invokes dotnet nuget push with *.nupkg glob', async () => {
    await publish({}, makeContext());

    const [file, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(file).toBe('dotnet');
    expect(args).toContain('nuget');
    expect(args).toContain('push');
    expect(args).toContain('*.nupkg');
  });

  it('passes api-key as a discrete arg when NUGET_API_KEY is set', async () => {
    await publish({}, makeContext({ env: { NUGET_API_KEY: 'my-key' } }));

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    const keyIdx = args.indexOf('--api-key');
    expect(keyIdx).toBeGreaterThan(-1);
    expect(args[keyIdx + 1]).toBe('my-key');
  });

  it('omits api-key args when NUGET_API_KEY is not set', async () => {
    await publish({}, makeContext({ env: {} }));

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(args).not.toContain('--api-key');
    expect(args).not.toContain('--symbol-api-key');
  });

  it('passes --source as a discrete arg', async () => {
    await publish({ source: 'https://nuget.example.com/v3/index.json' }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    const srcIdx = args.indexOf('--source');
    expect(srcIdx).toBeGreaterThan(-1);
    expect(args[srcIdx + 1]).toBe('https://nuget.example.com/v3/index.json');
  });

  it('passes --symbol-source as a discrete arg', async () => {
    await publish({ symbolSource: 'https://symbols.example.com' }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    const symIdx = args.indexOf('--symbol-source');
    expect(symIdx).toBeGreaterThan(-1);
    expect(args[symIdx + 1]).toBe('https://symbols.example.com');
  });

  it('includes --skip-duplicate when set', async () => {
    await publish({ skipDuplicate: true }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(args).toContain('--skip-duplicate');
  });

  it('passes --timeout as a discrete arg', async () => {
    await publish({ timeout: 300 }, makeContext());

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    const tIdx = args.indexOf('--timeout');
    expect(tIdx).toBeGreaterThan(-1);
    expect(args[tIdx + 1]).toBe('300');
  });

  it('resolves nupkgRoot relative to cwd', async () => {
    await publish({ nupkgRoot: 'artifacts' }, makeContext({ cwd: '/project' }));

    const [, , options] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(options.cwd).toBe('/project/artifacts');
  });

  it('uses cwd directly when nupkgRoot is not set', async () => {
    await publish({}, makeContext({ cwd: '/project' }));

    const [, , options] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(options.cwd).toBe('/project');
  });
});
