import {
  ensureNxProject,
  runNxCommandAsync,
  uniq,
} from '@nrwl/nx-plugin/testing';
describe('nx-oc e2e', () => {

  beforeEach(() => 
    ensureNxProject('@abgov/nx-oc', 'dist/packages/nx-oc')
  );

  describe('workspace', () => {
    it('should create workspace', async (done) => {
      const plugin = uniq('workspace');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-oc:workspace ${plugin}-build ${plugin}-infra ${plugin}-dev`
      );
  
      expect(result.stderr).toBeFalsy();
  
      done();
    });
  });

  describe('apply-infra', () => {
    it('should run oc cli', async (done) => {
      const plugin = uniq('workspace');
      const result = await runNxCommandAsync(
        `generate @abgov/nx-oc:apply-infra`
      );
  
      expect(result.stdout).toContain('oc project');
  
      done();
    });
  });
});
