import { ExecutorContext } from '@nrwl/devkit';
import { mocked } from 'jest-mock';
import executor from './test';

import { runDotnetCommand } from '../../utils/dotnet-utils';
jest.mock('../../utils/dotnet-utils');

const mockRunDotnetCommand = mocked(runDotnetCommand);

describe('Test Executor', () => {

  beforeEach(() => {
    mockRunDotnetCommand.mockReset();
  });

  it('can run', async () => {
    mockRunDotnetCommand.mockReturnValue(Promise.resolve({ success: true }));
    
    const { success } = await executor(
      { csProject: 'test' }, 
      {} as ExecutorContext
    );
    
    expect(success).toBe(true);
    expect(mockRunDotnetCommand.mock.calls.length).toBe(1);
    expect(mockRunDotnetCommand.mock.calls[0][0]).toBe('test');
  });
});
