import { Schema } from './schema';
import executor from './executor';
import { ExecutorContext } from '@nrwl/devkit';

const options: Schema = { ocProject: [] };

describe('Apply Executor', () => {
  it('can run', async () => {
    const output = await executor(options, {projectName: 'test'} as ExecutorContext);
    expect(output.success).toBe(true);
  });
});
