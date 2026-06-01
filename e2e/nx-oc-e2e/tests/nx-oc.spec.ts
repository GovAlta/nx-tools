import {
  checkFilesExist,
  ensureNxProject,
  runNxCommandAsync,
  uniq,
} from '@nx/plugin/testing';

describe('nx-oc e2e', () => {
  beforeEach(() => ensureNxProject('@abgov/nx-oc', 'dist/packages/nx-oc'));

  describe('pipeline', () => {
    it('should create jenkins pipeline files', async () => {
      const plugin = uniq('pipeline');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-oc:pipeline ${plugin}-build ${plugin}-infra --t jenkins --e ${plugin}-dev`
      );

      expect(result.stderr).toBeFalsy();
      expect(() =>
        checkFilesExist(`.openshift/${plugin}-build/${plugin}-build.yml`)
      ).not.toThrow();
    }, 60000);

    it('should create github actions pipeline files', async () => {
      const plugin = uniq('pipeline');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-oc:pipeline ${plugin}-build ${plugin}-infra --t actions --e ${plugin}-dev`
      );

      expect(result.stderr).toBeFalsy();
      expect(() =>
        checkFilesExist(
          `.openshift/${plugin}-build/${plugin}-build.yml`,
          `.github/workflows/${plugin}-build.yml`
        )
      ).not.toThrow();
    }, 60000);
  });

  describe('apply-infra', () => {
    it('should run without error', async () => {
      const result = await runNxCommandAsync(`generate @abgov/nx-oc:apply-infra`);
      expect(result.stderr).toBeFalsy();
    }, 60000);
  });
});
