import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { AddressInfo } from 'net';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  checkFilesExist,
  cleanup,
  patchPackageJsonForPlugin,
  runNxCommandAsync,
  tmpProjPath,
  uniq,
} from '@nx/plugin/testing';

// All tests pass --tenant=test --accessToken=mock-token --skipAgent to avoid
// interactive flows and the agent-service WebSocket.

// npm 7+ symlinks file: deps by default. When nx-adsp is symlinked, Node.js
// resolves @abgov/nx-oc from the monorepo root (TypeScript source, not dist).
// --install-links forces npm to copy file: deps so generators run from the
// e2e workspace's node_modules and resolve @abgov/nx-oc from the same copy.
// Both packages are patched before the single install to avoid two installs.
function setupE2eWorkspace(mockUrl: string) {
  cleanup();
  const localTmpDir = dirname(tmpProjPath());
  mkdirSync(localTmpDir, { recursive: true });
  execSync(
    `node ${require.resolve('nx')} new proj --nx-workspace-root=${localTmpDir} --no-interactive --skip-install --collection=@nx/workspace --npmScope=proj --preset=apps`,
    { cwd: localTmpDir, stdio: ['ignore', 'ignore', 'ignore'] }
  );
  patchPackageJsonForPlugin('@abgov/nx-adsp', 'dist/packages/nx-adsp');
  patchPackageJsonForPlugin('@abgov/nx-oc', 'dist/packages/nx-oc');
  // Suppress peer-dep version conflicts during workspace setup and generator installs.
  writeFileSync(join(tmpProjPath(), '.npmrc'), 'legacy-peer-deps=true\n');
  execSync('npm install --install-links', {
    cwd: tmpProjPath(),
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  // npm caches file: deps by tarball hash and may install a stale compiled version.
  // Directly overwrite environments.js so the generator always uses the mock URLs.
  writeFileSync(
    join(tmpProjPath(), 'node_modules/@abgov/nx-oc/src/adsp/environments.js'),
    `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.environments = void 0;
exports.environments = {
  dev:  { accessServiceUrl: "${mockUrl}", directoryServiceUrl: "${mockUrl}" },
  test: { accessServiceUrl: "${mockUrl}", directoryServiceUrl: "${mockUrl}" },
  prod: { accessServiceUrl: "${mockUrl}", directoryServiceUrl: "${mockUrl}" },
};
`
  );
}

const MOCK_CLIENT_UUID = 'aaaa1111-bbbb-cccc-dddd-eeee22223333';

function respond(method: string, url: string, res: ServerResponse, port: number): void {
  const base = `http://localhost:${port}`;

  if (url.startsWith('/directory/v2/namespaces/platform/entries')) {
    return json(res, 200, [
      { urn: 'urn:ads:platform:tenant-service',        url: base },
      { urn: 'urn:ads:platform:tenant-service:v2',     url: base },
      { urn: 'urn:ads:platform:event-service',         url: `${base}/event` },
      { urn: 'urn:ads:platform:configuration-service', url: `${base}/config` },
      { urn: 'urn:ads:platform:push-service',          url: `${base}/push` },
    ]);
  }

  if (url.includes('/tenants')) {
    return json(res, 200, { results: [{ name: 'test', realm: 'test' }] });
  }

  if (method === 'GET' && url.includes('/clients') && url.includes('clientId=')) {
    return json(res, 200, []);
  }

  if (method === 'POST' && /\/clients\/?$/.test(url.split('?')[0])) {
    res.writeHead(201, {
      'Content-Type': 'application/json',
      Location: `${base}/auth/admin/realms/test/clients/${MOCK_CLIENT_UUID}`,
    });
    res.end('{}');
    return;
  }

  if (url.includes('/client-secret')) {
    return json(res, 200, { type: 'secret', value: 'mock-client-secret' });
  }

  if (url.includes('/service-account-user')) {
    return json(res, 200, { id: 'mock-sa-user-id' });
  }

  if (url.includes('/role-mappings')) {
    return json(res, 200, method === 'GET' ? [] : {});
  }

  if (url.includes('/scope-mappings')) {
    return json(res, 200, method === 'GET' ? [] : {});
  }

  if (url.includes('/roles')) {
    return json(res, method === 'GET' ? 404 : 201, method === 'GET' ? { error: 'Role not found' } : {});
  }

  if (url.includes('/protocol-mappers')) {
    return json(res, method === 'GET' ? 200 : 201, method === 'GET' ? [] : {});
  }

  json(res, 404, { error: 'Not found' });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

describe('nx-adsp e2e', () => {
  let mockServer: Server;
  let mockUrl: string;

  beforeAll(async () => {
    let port = 0;
    mockServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => respond(req.method ?? 'GET', req.url ?? '', res, port));
    });
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    port = (mockServer.address() as AddressInfo).port;
    mockUrl = `http://localhost:${port}`;
  }, 30000);

  afterAll(async () => {
    if (mockServer) {
      await new Promise<void>((resolve, reject) =>
        mockServer.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  beforeEach(() => {
    setupE2eWorkspace(mockUrl);
  });

  describe('express service', () => {
    it('should generate and build', async () => {
      const plugin = uniq('express-service');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:express-service ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent --database=none`
      );
      checkFilesExist(`${plugin}/src/main.ts`);
      const result = await runNxCommandAsync(`build ${plugin}`);
      expect(result.stdout).toContain('Successfully ran target');
    }, 180000);

    it('should generate with an explicit access token', async () => {
      const plugin = uniq('express-service');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:express-service ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );
      checkFilesExist(`${plugin}/src/main.ts`);
    }, 90000);
  });

  describe('react app', () => {
    it('should generate and build', async () => {
      const plugin = uniq('react-app');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:react-app ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );
      checkFilesExist(`${plugin}/src/app/app.tsx`);
      const result = await runNxCommandAsync(`build ${plugin}`);
      expect(result.stdout).toContain('Successfully ran target');
    }, 180000);
  });

  describe('vue app', () => {
    it('should generate and build', async () => {
      const plugin = uniq('vue-app');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:vue-app ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );
      checkFilesExist(
        `${plugin}/src/App.vue`,
        `${plugin}/src/main.ts`,
        `${plugin}/src/router/index.ts`,
        `${plugin}/src/views/HomeView.vue`,
      );
      const result = await runNxCommandAsync(`build ${plugin}`);
      expect(result.stdout).toContain('Successfully ran target');
    }, 240000);
  });

  it('should generate angular app and build', async () => {
    const plugin = uniq('angular-app');
    await runNxCommandAsync(
      `generate @abgov/nx-adsp:angular-app ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
    );

    checkFilesExist(
      `${plugin}/src/app/app.component.ts`,
      `${plugin}/src/main.ts`
    );

    const result = await runNxCommandAsync(`build ${plugin}`);
    expect(result.stdout).toContain('Successfully ran target');
  }, 180000);

  describe('pern', () => {
    it('should generate fullstack with Prisma and build the service', async () => {
      const plugin = uniq('pern');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:pern ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );

      checkFilesExist(
        `${plugin}-service/src/main.ts`,
        `${plugin}-service/prisma/schema.prisma`,
        `${plugin}-app/nginx.conf`,
        `${plugin}-app/src/app/app.tsx`,
      );

      const result = await runNxCommandAsync(`build ${plugin}-service`);
      expect(result.stdout).toContain('Successfully ran target');
    }, 240000);
  });

  describe('pean', () => {
    it('should generate fullstack with Prisma and build the service', async () => {
      const plugin = uniq('pean');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:pean ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );

      checkFilesExist(
        `${plugin}-service/src/main.ts`,
        `${plugin}-service/prisma/schema.prisma`,
        `${plugin}-app/nginx.conf`,
        `${plugin}-app/src/main.ts`,
      );

      const result = await runNxCommandAsync(`build ${plugin}-service`);
      expect(result.stdout).toContain('Successfully ran target');
    }, 240000);
  });

  describe('pevn', () => {
    it('should generate fullstack with Prisma and build the service', async () => {
      const plugin = uniq('pevn');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:pevn ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );

      checkFilesExist(
        `${plugin}-service/src/main.ts`,
        `${plugin}-service/prisma/schema.prisma`,
        `${plugin}-app/nginx.conf`,
        `${plugin}-app/src/App.vue`,
      );

      const result = await runNxCommandAsync(`build ${plugin}-service`);
      expect(result.stdout).toContain('Successfully ran target');
    }, 240000);
  });

  describe('mevn', () => {
    it('should generate fullstack and build the service', async () => {
      const plugin = uniq('mevn');
      await runNxCommandAsync(
        `generate @abgov/nx-adsp:mevn ${plugin} dev --tenant=test --accessToken=mock-token --skipAgent`
      );

      checkFilesExist(
        `${plugin}-service/src/main.ts`,
        `${plugin}-app/nginx.conf`,
        `${plugin}-app/src/App.vue`,
      );

      const result = await runNxCommandAsync(`build ${plugin}-service`);
      expect(result.stdout).toContain('Successfully ran target');
    }, 240000);
  });
});
