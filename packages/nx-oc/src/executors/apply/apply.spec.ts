import { ExecutorContext } from '@nrwl/devkit';
import { mocked } from 'ts-jest/utils'
import { Schema } from './schema';
import executor from './apply';
import { runOcCommand } from '../../utils/oc-utils';

jest.mock('../../utils/oc-utils');
const mockedRunOcCommand = mocked(runOcCommand);

const options: Schema = { ocProject: 'test-dev' };

describe('Apply Executor', () => {

  beforeEach(() => {
    mockedRunOcCommand.mockReset();
  });

  it('can run', async () => {
    mockedRunOcCommand.mockReturnValue({ success: true });
    
    const { success } = await executor(options, {projectName: 'test'} as ExecutorContext);
    expect(success).toBe(true);
    
    expect(mockedRunOcCommand.mock.calls.length).toBe(2);
    expect(mockedRunOcCommand.mock.calls[0][0]).toBe('process');
    expect(mockedRunOcCommand.mock.calls[1][0]).toBe('apply');
  });

  it('can run for multiple environments', async () => {
    mockedRunOcCommand.mockReturnValue({ success: true });
    
    const { success } = await executor(
      {...options, ocProject: ['test-dev', 'test-qa'] }, 
      {projectName: 'test'} as ExecutorContext
    );
    
    expect(success).toBe(true);
    expect(mockedRunOcCommand.mock.calls.length).toBe(4);
  });

  it('can return unsuccessful result', async () => {
    mockedRunOcCommand.mockReturnValue({ success: false });
    
    const { success } = await executor(
      options, 
      {projectName: 'test'} as ExecutorContext
    );
    
    expect(success).toBe(false);
    expect(mockedRunOcCommand.mock.calls.length).toBe(1);
  });
});
