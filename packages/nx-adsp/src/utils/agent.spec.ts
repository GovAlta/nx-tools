import { consultAgent, isNonInteractive } from './agent';

jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: jest.fn((_prompt: string, cb: (answer: string) => void) => cb('')),
    close: jest.fn(),
    on: jest.fn(),
  })),
}));

jest.mock('socket.io-client');
jest.mock('@abgov/nx-oc', () => ({ getServiceUrls: jest.fn() }));
jest.mock('@nx/devkit', () => ({ Tree: jest.fn() }));

// Enquirer is dynamically imported inside consultAgent; mock it here so the
// prompt resolves immediately with an empty description in all tests.
jest.mock('enquirer', () => ({
  prompt: jest.fn().mockResolvedValue({ description: '' }),
}));

import { io } from 'socket.io-client';
import { getServiceUrls } from '@abgov/nx-oc';

const mockedIo = jest.mocked(io);
const mockedGetServiceUrls = jest.mocked(getServiceUrls);

const PROJECT_CONTEXT = {
  projectName: 'test-service',
  projectType: 'express-service' as const,
  tenant: 'test-tenant',
  pluginVersion: '12.x',
  existingFiles: {
    'src/main.ts': 'const app = express();',
    'src/environment.ts': 'export const environment = {};',
  },
};

const mockHost = { write: jest.fn(), read: jest.fn() } as unknown as import('@nx/devkit').Tree;

function makeMockSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const socket = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    once: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    _handlers: handlers,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedIo.mockReturnValue(socket as any);
  return socket;
}

// Flush the microtask queue so async operations inside consultAgent settle.
// One tick is enough: the dynamic import and the enquirer mock both resolve
// as microtasks, so after this all handlers are registered and descriptionReady=true.
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('consultAgent', () => {
  const ORIGINAL_ARGV = process.argv;
  const ORIGINAL_TTY = process.stdout.isTTY;
  const ORIGINAL_CI = process.env.CI;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    // consultAgent short-circuits when non-interactive; force an interactive
    // TTY (no flag, no CI) so these tests exercise the interactive flow.
    process.argv = ['node', 'nx'];
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    delete process.env.CI;
  });
  afterAll(() => {
    process.argv = ORIGINAL_ARGV;
    Object.defineProperty(process.stdout, 'isTTY', { value: ORIGINAL_TTY, configurable: true });
    if (ORIGINAL_CI === undefined) delete process.env.CI;
    else process.env.CI = ORIGINAL_CI;
  });

  it('returns null when agent-service is not in directory', async () => {
    mockedGetServiceUrls.mockResolvedValue({});
    const result = await consultAgent('https://directory.example.com', 'token', PROJECT_CONTEXT, mockHost, 'apps/test-service');
    expect(result).toBeNull();
  });

  it('returns null on socket connect error', async () => {
    mockedGetServiceUrls.mockResolvedValue({
      'urn:ads:platform:agent-service:v1': 'https://agent.example.com',
    });
    const socket = makeMockSocket();
    const resultPromise = consultAgent('https://directory.example.com', 'token', PROJECT_CONTEXT, mockHost, 'apps/test-service');
    // After one tick: enquirer mock resolves, descriptionReady=true, conversationPromise returned.
    await flushPromises();
    socket._handlers['connect_error']?.();
    expect(await resultPromise).toBeNull();
  });

  it('applies workspace files to Nx Tree and returns filesWritten count', async () => {
    mockedGetServiceUrls.mockResolvedValue({
      'urn:ads:platform:agent-service:v1': 'https://agent.example.com',
    });
    const socket = makeMockSocket();
    const resultPromise = consultAgent('https://directory.example.com', 'token', PROJECT_CONTEXT, mockHost, 'apps/test-service');
    await flushPromises();

    // descriptionReady=true at this point; workspace-updated fires last → triggers sendInitialMessage.
    socket._handlers['connect']?.();
    // Server signals readiness via 'message' before workspace-update is safe to send.
    socket._handlers['message']?.('Connected as user...');
    socket._handlers['workspace-updated']?.();
    // Simulate agent responding with text (sets agentHasResponded = true)
    socket._handlers['stream']?.({ chunk: { type: 'text-delta', payload: { text: 'I will add events.' } }, done: false });
    socket._handlers['stream']?.({ chunk: null, done: true });
    socket._handlers['workspace-state']?.({
      files: [
        { path: 'src/roles.ts', content: 'export enum ServiceRoles {}' },
        { path: 'src/main.ts', content: 'updated main.ts' },
      ],
    });

    const result = await resultPromise;
    expect(result).toEqual({ filesWritten: 2, userInteracted: true, interrupted: false });
    expect(mockHost.write).toHaveBeenCalledWith('apps/test-service/src/roles.ts', 'export enum ServiceRoles {}');
    expect(mockHost.write).toHaveBeenCalledWith('apps/test-service/src/main.ts', 'updated main.ts');
  });

  it('uploads existing files to workspace before sending the initial message', async () => {
    mockedGetServiceUrls.mockResolvedValue({
      'urn:ads:platform:agent-service:v1': 'https://agent.example.com',
    });
    const socket = makeMockSocket();
    const resultPromise = consultAgent('https://directory.example.com', 'token', PROJECT_CONTEXT, mockHost, 'apps/test-service');
    await flushPromises();

    // connect → server sends 'message' readiness signal → workspace-update emitted → workspace-updated → initial message sent
    socket._handlers['connect']?.();
    socket._handlers['message']?.('Connected as user...');
    socket._handlers['workspace-updated']?.();
    socket._handlers['stream']?.({ chunk: { type: 'text-delta', payload: { text: 'What does this service do?' } }, done: false });
    socket._handlers['stream']?.({ chunk: null, done: true });
    socket._handlers['workspace-state']?.({ files: [] });
    await resultPromise;

    expect(socket.emit).toHaveBeenCalledWith(
      'workspace-update',
      expect.objectContaining({
        agent: 'nxAdspAgent',
        writes: expect.arrayContaining([
          expect.objectContaining({ path: 'src/main.ts' }),
        ]),
      })
    );
    expect(socket.emit).toHaveBeenCalledWith(
      'message',
      expect.objectContaining({
        agent: 'nxAdspAgent',
        content: expect.stringContaining('src/main.ts'),
      })
    );
  });
});

describe('isNonInteractive', () => {
  const ORIGINAL_ARGV = process.argv;
  const ORIGINAL_TTY = process.stdout.isTTY;
  const ORIGINAL_CI = process.env.CI;
  const setTTY = (v: boolean | undefined) =>
    Object.defineProperty(process.stdout, 'isTTY', { value: v, configurable: true });

  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
    setTTY(ORIGINAL_TTY);
    if (ORIGINAL_CI === undefined) delete process.env.CI;
    else process.env.CI = ORIGINAL_CI;
  });

  it('is true when --no-interactive is passed, even in an interactive TTY', () => {
    setTTY(true);
    delete process.env.CI;
    process.argv = ['node', 'nx', 'g', 'x', '--no-interactive'];
    expect(isNonInteractive()).toBe(true);
  });

  it('honors --interactive=false and --interactive false', () => {
    setTTY(true);
    delete process.env.CI;
    process.argv = ['node', 'nx', 'g', 'x', '--interactive=false'];
    expect(isNonInteractive()).toBe(true);
    process.argv = ['node', 'nx', 'g', 'x', '--interactive', 'false'];
    expect(isNonInteractive()).toBe(true);
  });

  it('is true without a TTY or on CI', () => {
    setTTY(false);
    delete process.env.CI;
    process.argv = ['node', 'nx'];
    expect(isNonInteractive()).toBe(true);
    setTTY(true);
    process.env.CI = 'true';
    expect(isNonInteractive()).toBe(true);
  });

  it('is false in an interactive TTY with no flag and no CI', () => {
    setTTY(true);
    delete process.env.CI;
    process.argv = ['node', 'nx', 'g', 'x'];
    expect(isNonInteractive()).toBe(false);
  });
});
