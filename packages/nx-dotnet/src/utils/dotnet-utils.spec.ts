import { mocked } from 'ts-jest/utils';
import { runDotnetCommand } from './dotnet-utils';

import * as execa from 'execa';
jest.mock('execa');

const mockedExeca = mocked(execa as 
  (file: string, args: readonly string[]) => execa.ExecaChildProcess<string>
);

describe('Test Executor', () => {
  
  beforeEach(() => {
    mockedExeca.mockReset();
  });
  
  it('can run', async (done) => {
    mockedExeca.mockReturnValue(
      Promise.resolve({success: true}) as unknown as execa.ExecaChildProcess<string>
    );

    const {success} = await runDotnetCommand('build');

    expect(success).toBeTruthy();

    done();
  });
});