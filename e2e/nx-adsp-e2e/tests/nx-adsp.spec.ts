import {
  checkFilesExist,
  ensureNxProject,
  runNxCommandAsync,
  uniq,
} from '@nx/plugin/testing';

// nx-adsp generators make live HTTP calls to ADSP APIs (getAdspConfiguration,
// getServiceUrls, selectTenant) which cannot run in a standard CI environment.
// Re-enable once the e2e setup can provide a mock ADSP server or credentials.
describe.skip('nx-adsp e2e', () => {
  beforeEach(() => {
    ensureNxProject('@abgov/nx-adsp', 'dist/packages/nx-adsp');
    // nx-adsp generators import @abgov/nx-oc at module load time; it must be in the e2e workspace
    ensureNxProject('@abgov/nx-oc', 'dist/packages/nx-oc');
  });

  describe('express service', () => {
    it('should create express-service', async () => {
      const plugin = uniq('express-service');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:express-service ${plugin} test`
      );
      expect(() => checkFilesExist(`apps/${plugin}/src/main.ts`)).not.toThrow();
    }, 60000);

    describe('--accessToken', () => {
      it('should create express-service with access token', async () => {
        const plugin = uniq('express-service');
        await runNxCommandAsync(
          `generate @abgov/nx-adsp:express-service ${plugin} test --accessToken mock-token`
        );
        expect(() =>
          checkFilesExist(`apps/${plugin}/src/main.ts`)
        ).not.toThrow();
      }, 60000);
    });
  });

  describe('react app', () => {
    it('should create react-app', async () => {
      const plugin = uniq('react-app');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:react-app ${plugin} test`
      );
      expect(() =>
        checkFilesExist(`apps/${plugin}/src/app/app.tsx`)
      ).not.toThrow();
    }, 60000);
  });

  it('should create angular app', async () => {
    const plugin = uniq('angular-app');
    await runNxCommandAsync(
      `generate @abgov/nx-adsp:angular-app ${plugin} test`
    );

    expect(() =>
      checkFilesExist(
        `apps/${plugin}/src/app/app.component.ts`,
        `apps/${plugin}/src/main.ts`
      )
    ).not.toThrow();

    const result = await runNxCommandAsync(`build ${plugin}`);
    expect(result.stdout).toContain('Executor ran');
  }, 120000);
});
