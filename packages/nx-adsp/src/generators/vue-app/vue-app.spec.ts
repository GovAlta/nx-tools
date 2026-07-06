import { readProjectConfiguration, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import * as utils from '@abgov/nx-oc';
import { environments } from '@abgov/nx-oc';
import { Schema } from './schema';
import generator from './vue-app';

jest.mock('@nx/devkit', () => ({
  ...jest.requireActual('@nx/devkit'),
  formatFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@abgov/nx-oc');
jest.mock('../../utils/agent', () => ({
  consultAgent: jest.fn().mockResolvedValue(null),
  confirmAfterAgentInterrupt: jest.fn().mockResolvedValue(undefined),
}));

const utilsMock = utils as jest.Mocked<typeof utils>;
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
});

describe('Vue App Generator', () => {
  let host: Tree;
  const options: Schema = { name: 'test', env: 'dev' };

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('can run', async () => {
    await generator(host, options);
    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');
    // nginx.conf lives in the Vite publicDir so it ends up in the build output.
    expect(host.exists('apps/test/public/nginx.conf')).toBeTruthy();
    expect(host.exists('apps/test/src/main.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/App.vue')).toBeTruthy();
    expect(host.exists('apps/test/src/router/index.ts')).toBeTruthy();
    expect(host.exists('apps/test/src/environments/environment.ts')).toBeTruthy();
    expect(host.exists('apps/test/vite.config.ts')).toBeTruthy();
    // The duplicate @nx/vue-generated config is removed.
    expect(host.exists('apps/test/vite.config.mts')).toBeFalsy();
    // build output mirrors the workspace layout under the root dist/.
    expect(config.targets.build.options.outputPath).toBe('dist/apps/test');
  }, 30000);

  it('AGENTS.md points at the current design system docs', async () => {
    await generator(host, options);
    const agents = host.read('apps/test/AGENTS.md').toString();
    expect(agents).toContain('design.alberta.ca/components');
    // guard against the retired ui-components.alberta.ca URL creeping back in
    expect(agents).not.toContain('ui-components.alberta.ca');
  }, 30000);

  it('inits Keycloak with no hidden iframes so init never hangs', async () => {
    await generator(host, options);
    // Strip // comments — they legitimately reference the disabled iframe options
    // to explain their absence; assert against the actual init code.
    const code = host
      .read('apps/test/src/main.ts')
      .toString()
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    // keycloak-js's silent-SSO (silentCheckSsoRedirectUri) and login-status
    // (checkLoginIframe) iframes both wait on an untimed postMessage that hangs
    // when third-party cookies are blocked, leaving keycloak.login() a no-op. We
    // disable both and skip the load-time check (empty onLoad) so init settles.
    expect(code).not.toContain('silentCheckSsoRedirectUri');
    expect(code).toContain('checkLoginIframe: false');
    expect(code).toContain("onLoad: ''");
    expect(code).toContain("pkceMethod: 'S256'");
    // the now-unused silent-check-sso.html is no longer generated
    expect(host.exists('apps/test/public/silent-check-sso.html')).toBeFalsy();
  }, 30000);

  it('reads Keycloak fields off the reactive instance without destructuring', async () => {
    await generator(host, options);
    // The Sign in no-op bug: destructuring useKeycloak() (a readonly(reactive()))
    // froze `keycloak` at undefined so login() never fired. Every consumer must
    // keep the instance and read fields off it.
    for (const file of [
      'apps/test/src/App.vue',
      'apps/test/src/views/HomeView.vue',
      'apps/test/src/views/ProtectedView.vue',
      'apps/test/src/router/index.ts',
    ]) {
      const code = host.read(file).toString();
      expect(code).toContain('= useKeycloak()');
      // no destructuring assignment off useKeycloak()
      expect(code).not.toMatch(/const\s*\{[^}]*\}\s*=\s*useKeycloak\(\)/);
    }
    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toContain('kc.keycloak?.login()');
  }, 30000);

  it('index.html is at the Vite entry root and its mount target matches main.ts', async () => {
    await generator(host, options);
    // Vite's entry is <projectRoot>/index.html, not src/index.html — a template
    // shipped under src/ is ignored, leaving @nx/vue's #root div while main.ts
    // mounts #app, so nothing renders. Guard both: correct path and matched id.
    expect(host.exists('apps/test/index.html')).toBeTruthy();
    expect(host.exists('apps/test/src/index.html')).toBeFalsy();
    const indexHtml = host.read('apps/test/index.html').toString();
    const mainTs = host.read('apps/test/src/main.ts').toString();
    const mountId = mainTs.match(/\.mount\(['"]#([\w-]+)['"]\)/)?.[1];
    expect(mountId).toBeTruthy();
    expect(indexHtml).toContain(`id="${mountId}"`);
  }, 30000);

  it('static assets live in public/ so Vite serves them at the referenced URLs', async () => {
    await generator(host, options);
    // App.vue's <goa-hero-banner backgroundurl="/assets/banner.jpg"> and
    // index.html's favicon.ico are absolute-URL string refs, so they must be in
    // the Vite publicDir (public/) — a src/assets file is not served at /assets.
    const appVue = host.read('apps/test/src/App.vue').toString();
    const bannerUrl = appVue.match(/backgroundurl="([^"]+)"/)?.[1];
    expect(bannerUrl).toBe('/assets/banner.jpg');
    expect(host.exists('apps/test/public/assets/banner.jpg')).toBeTruthy();
    expect(host.exists('apps/test/src/assets/banner.jpg')).toBeFalsy();
    expect(host.exists('apps/test/public/favicon.ico')).toBeTruthy();
  }, 30000);

  it('vite.config.ts marks goa-* elements as custom elements', async () => {
    await generator(host, options);
    const viteConfig = host.read('apps/test/vite.config.ts').toString();
    expect(viteConfig).toContain("isCustomElement: (tag) => tag.startsWith('goa-')");
  }, 30000);

  it('shows the Sign in button without gating on Keycloak readiness', async () => {
    await generator(host, options);
    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toContain('Sign in');
    // The reported bug: gating Sign in on `ready` hides it when check-sso never
    // resolves. It must gate on !authenticated only (like the react/angular apps).
    expect(app).not.toContain('!authenticated && ready');
    // Header actions grouped for layout, matching react/angular.
    expect(app).toContain('goa-button-group');
  }, 30000);

  it('removes the @nx/vue demo scaffold and ships a passing App test', async () => {
    await generator(host, options);
    // The stale nx demo + its failing test must be gone (they fail against our shell).
    expect(host.exists('apps/test/src/app/App.vue')).toBeFalsy();
    expect(host.exists('apps/test/src/app/App.spec.ts')).toBeFalsy();
    expect(host.exists('apps/test/src/app/NxWelcome.vue')).toBeFalsy();
    // Replaced by our own App test.
    expect(host.exists('apps/test/src/App.spec.ts')).toBeTruthy();
  }, 30000);

  it('environment.ts is pre-populated with tenant config', async () => {
    await generator(host, options);
    const env = host.read('apps/test/src/environments/environment.ts').toString();
    expect(env).toContain(environments.test.accessServiceUrl);
    expect(env).toContain(environments.test.directoryServiceUrl);
    expect(env).toContain('urn:ads:test:test');
  }, 30000);

  it('can add nginx proxy', async () => {
    await generator(host, {
      ...options,
      proxy: { location: '/test/', proxyPass: 'http://test-service:3333/' },
    });
    const nginxConf = host.read('apps/test/public/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/');
  });

  it('can add multiple nginx proxies', async () => {
    await generator(host, {
      ...options,
      proxy: [
        { location: '/test/', proxyPass: 'http://test-service:3333/' },
        { location: '/test2/', proxyPass: 'http://test-service2:3333/' },
      ],
    });
    const nginxConf = host.read('apps/test/public/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/');
    expect(nginxConf).toContain('http://test-service2:3333/');
  });

  it('writes vite dev proxy config when proxy is configured', async () => {
    await generator(host, {
      ...options,
      proxy: { location: '/test/', proxyPass: 'http://test-service:3333/api/' },
    });
    expect(host.exists('apps/test/vite.proxy.json')).toBeTruthy();
    const proxyConf = JSON.parse(host.read('apps/test/vite.proxy.json').toString());
    expect(proxyConf['/test/'].target).toBe('http://localhost:3333');
    expect(proxyConf['/test/'].pathRewrite['^/test/']).toBe('/api/');
  });
});
