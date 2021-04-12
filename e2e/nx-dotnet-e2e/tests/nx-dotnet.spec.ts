import {
  checkFilesExist,
  ensureNxProject,
  readJson,
  runNxCommandAsync,
  uniq,
} from '@nrwl/nx-plugin/testing';
describe('nx-dotnet e2e', () => {

  describe('workspace', () => {
    it('should create props in workspace', async (done) => {
      const plugin = uniq('nx-dotnet');
      ensureNxProject('@abgov/nx-dotnet', 'dist/packages/nx-dotnet');
      await runNxCommandAsync(
        `generate @abgov/nx-dotnet:workspace`
      );
      expect(() =>
        checkFilesExist('Directory.Build.props')
      ).not.toThrow();
      done();
    });
  });
});
