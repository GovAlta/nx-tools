import { consultAgent } from './agent';

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
    emit: jest.fn(),
    disconnect: jest.fn(),
    _handlers: handlers,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedIo.mockReturnValue(socket as any);
  return socket;
}

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('consultAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
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

    socket._handlers['connect']?.();
    socket._handlers['stream']?.({ chunk: null, done: true });
    socket._handlers['workspace-state']?.({
      files: [
        { path: 'src/roles.ts', content: 'export enum ServiceRoles {}' },
        { path: 'src/main.ts', content: 'updated main.ts' },
      ],
    });

    const result = await resultPromise;
    expect(result).toEqual({ filesWritten: 2 });
    expect(mockHost.write).toHaveBeenCalledWith('apps/test-service/src/roles.ts', 'export enum ServiceRoles {}');
    expect(mockHost.write).toHaveBeenCalledWith('apps/test-service/src/main.ts', 'updated main.ts');
  });

  it('includes existing file content in the initial message', async () => {
    mockedGetServiceUrls.mockResolvedValue({
      'urn:ads:platform:agent-service:v1': 'https://agent.example.com',
    });
    const socket = makeMockSocket();
    const resultPromise = consultAgent('https://directory.example.com', 'token', PROJECT_CONTEXT, mockHost, 'apps/test-service');
    await flushPromises();

    socket._handlers['connect']?.();
    socket._handlers['stream']?.({ chunk: null, done: true });
    socket._handlers['workspace-state']?.({ files: [] });
    await resultPromise;

    expect(socket.emit).toHaveBeenCalledWith(
      'message',
      expect.objectContaining({
        agent: 'nxAdspAgent',
        content: expect.stringContaining('src/main.ts'),
      })
    );
  });
});
