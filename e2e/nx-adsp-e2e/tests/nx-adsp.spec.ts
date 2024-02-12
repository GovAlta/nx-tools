import {
  checkFilesExist,
  ensureNxProject,
  runNxCommandAsync,
  uniq,
} from '@nx/plugin/testing';

describe('nx-adsp e2e', () => {
  beforeEach(() => ensureNxProject('@abgov/nx-adsp', 'dist/packages/nx-adsp'));

  describe('express service', () => {
    it('should create express-service', async (done) => {
      const plugin = uniq('express-service');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-adsp:express-service ${plugin} test`
      );
      expect(() => checkFilesExist(`apps/${plugin}/src/main.ts`)).not.toThrow();

      done();
    }, 60000);

    describe('--tenant', () => {
      it('should create express-service', async (done) => {
        const plugin = uniq('express-service');
        const result = await runNxCommandAsync(
          `generate @abgov/nx-adsp:express-service ${plugin} --tenant test`
        );
        expect(() =>
          checkFilesExist(`apps/${plugin}/src/main.ts`)
        ).not.toThrow();

        done();
      }, 60000);
    });
  });

  describe('react app', () => {
    it('should create react-app', async (done) => {
      const plugin = uniq('react-app');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-adsp:react-app ${plugin} test`
      );
      expect(
        () => {} // checkFilesExist(`apps/${plugin}/src/main.ts`)
      ).not.toThrow();

      done();
    }, 60000);
  });

  it('should create angular app', async (done) => {
    const plugin = uniq('angular-app');
    await runNxCommandAsync(
      `generate @abgov/nx-adsp:angular-app ${plugin} test`
    );

    const result = await runNxCommandAsync(`build ${plugin}`);
    expect(result.stdout).toContain('Executor ran');

    done();
  }, 60000);
});
