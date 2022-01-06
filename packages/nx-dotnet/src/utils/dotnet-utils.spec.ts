import { mocked } from 'ts-jest/utils';
import { runDotnetCommand } from './dotnet-utils';

import * as execa from 'execa';
jest.mock('execa');

const mockedExeca = mocked(execa as 
  (file: string, args: readonly string[]) => execa.ExecaChildProcess<string>
);

import { once } from 'events';
jest.mock('events');

const mockedOnce = mocked(once);

describe('Test Executor', () => {
  
  beforeEach(() => {
    mockedExeca.mockReset();
  });
  
  it('can run', async () => {
    mockedExeca.mockReturnValue(
      { 
        stdout: {pipe: jest.fn()}
      } as unknown as execa.ExecaChildProcess<string>
    );

    mockedOnce.mockImplementation(() => Promise.resolve(null));

    const {success} = await runDotnetCommand('build');

    expect(success).toBeTruthy();
  });
});