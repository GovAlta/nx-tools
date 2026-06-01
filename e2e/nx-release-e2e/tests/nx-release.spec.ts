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
    it('should add release target and config files', async () => {
      const plugin = uniq('lib');
      await runNxCommandAsync(
        `generate @nx/node:library ${plugin} --publishable --importPath @test/${plugin}`
      );
      const result = await runNxCommandAsync(
        `generate @abgov/nx-release:lib ${plugin}`
      );

      expect(result.stderr).toBeFalsy();
      expect(() =>
        checkFilesExist(`.releaserc.json`, `libs/${plugin}/.releaserc.json`)
      ).not.toThrow();

      const releaseConfig = readJson(`libs/${plugin}/.releaserc.json`);
      expect(releaseConfig.plugins).toBeDefined();
    }, 60000);

    it('should not overwrite existing root .releaserc.json', async () => {
      const plugin = uniq('lib');
      await runNxCommandAsync(
        `generate @nx/node:library ${plugin} --publishable --importPath @test/${plugin}`
      );

      // Run twice — second run should leave root config unchanged
      await runNxCommandAsync(`generate @abgov/nx-release:lib ${plugin}`);
      const firstConfig = readJson(`.releaserc.json`);

      const plugin2 = uniq('lib');
      await runNxCommandAsync(
        `generate @nx/node:library ${plugin2} --publishable --importPath @test/${plugin2}`
      );
      await runNxCommandAsync(`generate @abgov/nx-release:lib ${plugin2}`);

      expect(readJson(`.releaserc.json`)).toEqual(firstConfig);
    }, 120000);
  });
});
