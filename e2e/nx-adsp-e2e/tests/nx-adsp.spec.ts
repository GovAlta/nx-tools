import {
  checkFilesExist,
  ensureNxProject,
  runNxCommandAsync,
  uniq,
} from '@nx/plugin/testing';

// globalSetup starts a mock ADSP server and sets ADSP_E2E_DIRECTORY_URL /
// ADSP_E2E_ACCESS_URL so that generators call the mock instead of the live
// gov.ab.ca endpoints.  All tests pass --tenant=test --accessToken=mock-token
// --skipAgent to avoid interactive flows and the agent-service WebSocket.
describe('nx-adsp e2e', () => {
  beforeEach(() => {
    ensureNxProject('@abgov/nx-adsp', 'dist/packages/nx-adsp');
    // nx-adsp generators import @abgov/nx-oc at module load time; it must be in the e2e workspace
    ensureNxProject('@abgov/nx-oc', 'dist/packages/nx-oc');
  });

  describe('express service', () => {
    it('should generate and build', async () => {
      const plugin = uniq('express-service');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:express-service ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent --database=none`
      );
      checkFilesExist(`apps/${plugin}/src/main.ts`);
      const result = await runNxCommandAsync(`build ${plugin}`);
      expect(result.stdout).toContain('Executor ran');
    }, 180000);

    it('should generate with an explicit access token', async () => {
      const plugin = uniq('express-service');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:express-service ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );
      checkFilesExist(`apps/${plugin}/src/main.ts`);
    }, 90000);
  });

  describe('react app', () => {
    it('should generate and build', async () => {
      const plugin = uniq('react-app');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:react-app ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );
      checkFilesExist(`apps/${plugin}/src/app/app.tsx`);
      const result = await runNxCommandAsync(`build ${plugin}`);
      expect(result.stdout).toContain('Executor ran');
    }, 180000);
  });

  it('should generate angular app and build', async () => {
    const plugin = uniq('angular-app');
    await runNxCommandAsync(
      `generate @abgov/nx-adsp:angular-app ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
    );

    checkFilesExist(
      `apps/${plugin}/src/app/app.component.ts`,
      `apps/${plugin}/src/main.ts`
    );

    const result = await runNxCommandAsync(`build ${plugin}`);
    expect(result.stdout).toContain('Executor ran');
  }, 180000);

  describe('pern', () => {
    it('should generate fullstack with Prisma and build the service', async () => {
      const plugin = uniq('pern');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:pern ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );

      checkFilesExist(
        `apps/${plugin}-service/src/main.ts`,
        `apps/${plugin}-service/prisma/schema.prisma`,
        `apps/${plugin}-app/nginx.conf`,
        `apps/${plugin}-app/src/app/app.tsx`,
      );

      const result = await runNxCommandAsync(`build ${plugin}-service`);
      expect(result.stdout).toContain('Executor ran');
    }, 240000);
  });

  describe('pean', () => {
    it('should generate fullstack with Prisma and build the service', async () => {
      const plugin = uniq('pean');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:pean ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );

      checkFilesExist(
        `apps/${plugin}-service/src/main.ts`,
        `apps/${plugin}-service/prisma/schema.prisma`,
        `apps/${plugin}-app/nginx.conf`,
        `apps/${plugin}-app/src/main.ts`,
      );

      const result = await runNxCommandAsync(`build ${plugin}-service`);
      expect(result.stdout).toContain('Executor ran');
    }, 240000);
  });
});
