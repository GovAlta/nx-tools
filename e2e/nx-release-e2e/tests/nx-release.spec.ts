import {
  checkFilesExist,
  copyNodeModules,
  ensureNxProject,
  readJson,
  runNxCommandAsync,
  uniq,
} from '@nx/plugin/testing';
describe('nx-release e2e', () => {
  beforeEach(() => {
    ensureNxProject('@abgov/nx-release', 'dist/packages/nx-release');
    copyNodeModules(['@nx/node']);
  });

  describe('lib', () => {
    it('should create release', async (done) => {
      const plugin = uniq('lib');
      await runNxCommandAsync(
        `generate @nx/node:library ${plugin} --publishable --importPath @test/${plugin}`
      );
      const result = await runNxCommandAsync(
        `generate @abgov/nx-release:lib ${plugin}`
      );

      expect(result.stderr).toBeFalsy();

      done();
    }, 60000);
  });
});
