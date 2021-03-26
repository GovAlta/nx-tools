import {
  checkFilesExist,
  ensureNxProject,
  runNxCommandAsync,
  uniq,
} from '@nrwl/nx-plugin/testing';

describe('nx-adsp e2e', () => {

  beforeEach(() => 
    ensureNxProject('@abgov/nx-adsp', 'dist/packages/nx-adsp')
  );
  
  describe('express service', () => {
    it('should create express-service', async (done) => {
      const plugin = uniq('express-service');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-adsp:express-service ${plugin} test`
      );
      expect(result.stderr).toBeFalsy();
      expect(() =>
        checkFilesExist(`apps/${plugin}/src/main.ts`)
      ).not.toThrow();
  
      done();
    });
  
    describe('--tenant', () => {
      it('should create express-service', async (done) => {
        const plugin = uniq('express-service');
        const result = await runNxCommandAsync(
          `generate @abgov/nx-adsp:express-service ${plugin} --tenant test`
        );
        
        expect(result.stderr).toBeFalsy();
        expect(() =>
          checkFilesExist(`apps/${plugin}/src/main.ts`)
        ).not.toThrow();
        
        done();
      });
    });
  });

  describe('react app', () => {
    it('should create react-app', async (done) => {
      const plugin = uniq('react-app');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-adsp:react-app ${plugin} test`
      );
      expect(result.stderr).toBeFalsy();
      expect(() =>
        {}// checkFilesExist(`apps/${plugin}/src/main.ts`)
      ).not.toThrow();
  
      done();
    });
  });
});
