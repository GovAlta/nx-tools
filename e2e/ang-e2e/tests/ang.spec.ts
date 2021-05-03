import {
  checkFilesExist,
  ensureNxProject,
  readJson,
  runNxCommandAsync,
  uniq,
} from '@nrwl/nx-plugin/testing';
describe('angular-app e2e', () => {
  it('should create angular-app', async (done) => {
    const plugin = uniq('angular-app');
    ensureNxProject('@abgov/angular-app', 'dist/packages/angular-app');
    await runNxCommandAsync(`generate @abgov/angular-app:angular-app ${plugin}`);

    const result = await runNxCommandAsync(`build ${plugin}`);
    expect(result.stdout).toContain('Executor ran');

    done();
  });

  describe('--directory', () => {
    it('should create src in the specified directory', async (done) => {
      const plugin = uniq('angular-app');
      ensureNxProject('@abgov/angular-app', 'dist/packages/angular-app');
      await runNxCommandAsync(
        `generate @abgov/angular-app:angular-app ${plugin} --directory subdir`
      );
      expect(() =>
        checkFilesExist(`libs/subdir/${plugin}/src/index.ts`)
      ).not.toThrow();
      done();
    });
  });

  describe('--tags', () => {
    it('should add tags to nx.json', async (done) => {
      const plugin = uniq('angular-app');
      ensureNxProject('@abgov/angular-app', 'dist/packages/angular-app');
      await runNxCommandAsync(
        `generate @abgov/angular-app:angular-app ${plugin} --tags e2etag,e2ePackage`
      );
      const nxJson = readJson('nx.json');
      expect(nxJson.projects[plugin].tags).toEqual(['e2etag', 'e2ePackage']);
      done();
    });
  });
});
