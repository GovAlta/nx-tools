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
        `generate @abgov/nx-oc:pipeline ${plugin}-build ${plugin}-infra --t jenkins --e ${plugin}-dev --r ghcr.io/test-org`
      );

      expect(result.stderr).not.toMatch(/error/i);
      expect(() =>
        checkFilesExist(
          `.openshift/environment.infra.yml`,
          `.openshift/environments.yml`
        )
      ).not.toThrow();
    }, 60000);

    it('should create github actions pipeline files', async () => {
      const plugin = uniq('pipeline');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-oc:pipeline ${plugin}-build ${plugin}-infra --t actions --e ${plugin}-dev --r ghcr.io/test-org`
      );

      expect(result.stderr).toBeFalsy();
      expect(() =>
        checkFilesExist(
          `.openshift/environment.infra.yml`,
          `.openshift/environments.yml`,
          `.github/workflows/pipeline.yml`
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
