import { execFile as execFileCb } from 'child_process';
import { readdirSync } from 'fs';
import { publish } from './publish';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));
jest.mock('util', () => ({
  promisify: jest.fn((fn) => fn),
}));
jest.mock('fs', () => ({
  readdirSync: jest.fn().mockReturnValue(['MyLib.1.2.3.nupkg']),
}));

const mockedExecFile = execFileCb as jest.MockedFunction<typeof execFileCb>;
const mockedReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    cwd: '/project',
    env: { NUGET_API_KEY: 'test-key' },
    logger: { log: jest.fn(), error: jest.fn() },
    ...overrides,
  } as never;
}

describe('publish', () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
    (mockedExecFile as unknown as jest.Mock).mockResolvedValue({ stdout: '', stderr: '' });
    (mockedReaddirSync as jest.Mock).mockReturnValue(['MyLib.1.2.3.nupkg']);
  });

  it('invokes dotnet nuget push with an explicit filename per package', async () => {
    await publish({}, makeContext());

    const [file, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(file).toBe('dotnet');
    expect(args).toContain('nuget');
    expect(args).toContain('push');
    expect(args).toContain('MyLib.1.2.3.nupkg');
    expect(args).not.toContain('*.nupkg');
  });

  it('pushes each .nupkg file in a separate execFile call', async () => {
    (mockedReaddirSync as jest.Mock).mockReturnValue(['Foo.1.0.0.nupkg', 'Bar.2.0.0.nupkg']);
    await publish({}, makeContext());

    expect(mockedExecFile).toHaveBeenCalledTimes(2);
    const firstArgs = (mockedExecFile as unknown as jest.Mock).mock.calls[0][1];
    const secondArgs = (mockedExecFile as unknown as jest.Mock).mock.calls[1][1];
    expect(firstArgs).toContain('Foo.1.0.0.nupkg');
    expect(secondArgs).toContain('Bar.2.0.0.nupkg');
  });

  it('scans basePath for .nupkg files', async () => {
    await publish({ nupkgRoot: 'artifacts' }, makeContext({ cwd: '/project' }));

    expect(mockedReaddirSync).toHaveBeenCalledWith('/project/artifacts');
  });

  it('filters non-.nupkg files from the directory listing', async () => {
    (mockedReaddirSync as jest.Mock).mockReturnValue([
      'MyLib.1.2.3.nupkg',
      'README.md',
      'MyLib.1.2.3.snupkg',
    ]);
    await publish({}, makeContext());

    expect(mockedExecFile).toHaveBeenCalledTimes(1);
    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    expect(args).toContain('MyLib.1.2.3.nupkg');
    expect(args).not.toContain('README.md');
  });

  it('throws when no .nupkg files are found', async () => {
    (mockedReaddirSync as jest.Mock).mockReturnValue([]);
    await expect(publish({}, makeContext())).rejects.toThrow('No .nupkg files found');
  });

  it('passes --api-key as a discrete arg when NUGET_API_KEY is set', async () => {
    await publish({}, makeContext({ env: { NUGET_API_KEY: 'my-key' } }));

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    const keyIdx = args.indexOf('--api-key');
    expect(keyIdx).toBeGreaterThan(-1);
    expect(args[keyIdx + 1]).toBe('my-key');
  });

  it('passes --symbol-api-key when NUGET_API_KEY is set', async () => {
    await publish({}, makeContext({ env: { NUGET_API_KEY: 'my-key' } }));

    const [, args] = (mockedExecFile as unknown as jest.Mock).mock.calls[0];
    const symKeyIdx = args.indexOf('--symbol-api-key');
    expect(symKeyIdx).toBeGreaterThan(-1);
    expect(args[symKeyIdx + 1]).toBe('my-key');
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
