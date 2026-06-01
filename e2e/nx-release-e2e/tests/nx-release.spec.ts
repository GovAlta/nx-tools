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

      // npm warns to stderr for deprecated packages and allow-scripts; ignore warnings, check for actual errors
      expect(result.stderr).not.toContain('ERR!');

      // Root .releaserc.json is always at the workspace root regardless of library path
      expect(() => checkFilesExist(`.releaserc.json`)).not.toThrow();

      // Get the actual project root from Nx (Nx 22 as-provided mode places libs at ${name}/, not libs/${name}/)
      const projectInfo = await runNxCommandAsync(`show project ${plugin} --json`);
      const projectRoot = JSON.parse(projectInfo.stdout).root;
      expect(() => checkFilesExist(`${projectRoot}/.releaserc.json`)).not.toThrow();

      const releaseConfig = readJson(`${projectRoot}/.releaserc.json`);
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
