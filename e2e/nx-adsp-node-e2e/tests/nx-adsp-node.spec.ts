import {
  checkFilesExist,
  ensureNxProject,
  readJson,
  runNxCommandAsync,
  uniq,
} from '@nrwl/nx-plugin/testing';
describe('nx-adsp-node e2e', () => {
  it('should create application', async (done) => {
    const plugin = uniq('application');
    ensureNxProject('@abgov/nx-adsp-node', 'dist/packages/nx-adsp-node');
    
    const result = await runNxCommandAsync(
      `generate @abgov/nx-adsp-node:application ${plugin} test`
    );
    expect(result.stderr).toBeFalsy();
    expect(() =>
      checkFilesExist(`apps/${plugin}/src/main.ts`)
    ).not.toThrow();

    done();
  });

  describe('--tenant', () => {
    it('should create application', async (done) => {
      const plugin = uniq('application');
      ensureNxProject('@abgov/nx-adsp-node', 'dist/packages/nx-adsp-node');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-adsp-node:application ${plugin} --tenant test`
      );
      
      expect(result.stderr).toBeFalsy();
      expect(() =>
        checkFilesExist(`apps/${plugin}/src/main.ts`)
      ).not.toThrow();
      
      done();
    });
  });
});
