import {
  addProjectConfiguration,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
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
// jest.mock('@abgov/nx-oc') automocks adspProjectTags too — restore the real
// (pure, no I/O) implementation so tag-writing behavior is actually exercised.
utilsMock.adspProjectTags.mockImplementation(
  jest.requireActual('@abgov/nx-oc').adspProjectTags,
);

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
    expect(
      host.exists('apps/test/src/environments/environment.ts'),
    ).toBeTruthy();
    expect(host.exists('apps/test/vite.config.ts')).toBeTruthy();
    // The duplicate @nx/vue-generated config is removed.
    expect(host.exists('apps/test/vite.config.mts')).toBeFalsy();
    // build output mirrors the workspace layout under the root dist/.
    expect(config.targets.build.options.outputPath).toBe('dist/apps/test');
  }, 30000);

  it("runs nx-adsp's own workspace-root setup (ADSP SDK MCP server + VS Code settings)", async () => {
    await generator(host, options);

    expect(host.exists('.mcp.json')).toBeTruthy();
    expect(host.exists('.vscode/settings.json')).toBeTruthy();
  }, 30000);

  it('loads design tokens before web-components CSS, so goa-* elements are actually styled', async () => {
    // @abgov/web-components' own CSS only defines rules in terms of --goa-*
    // custom properties — without the tokens stylesheet also loaded, every
    // goa-* element (header, banner, buttons) renders with no spacing at
    // all, not just unbranded. Regression guard for exactly that gap.
    await generator(host, options);

    const mainTs = host.read('apps/test/src/main.ts').toString();
    expect(mainTs).toContain("import '@abgov/design-tokens/dist/tokens.css';");
    expect(mainTs).toContain("import '@abgov/web-components/index.css';");
  }, 30000);

  it('records the resolved env/tenant as project tags for the sandbox generator', async () => {
    await generator(host, options);
    const config = readProjectConfiguration(host, 'test');
    expect(config.tags).toContain('adsp:scaffold-env:dev');
    expect(config.tags).toContain('adsp:scaffold-tenant:test');
  }, 30000);

  it('scaffolds a Playwright e2e project (consistent across frontends)', async () => {
    await generator(host, options);
    expect(host.exists('apps/test-e2e/project.json')).toBeTruthy();
    expect(
      host.exists('apps/test-e2e/playwright.config.ts') ||
        host.exists('apps/test-e2e/playwright.config.mts'),
    ).toBe(true);
    expect(host.exists('apps/test-e2e/cypress.config.ts')).toBeFalsy();
    // webServer guarded so CI can target a deployed URL (BASE_URL) instead of a local server
    const cfg = host.exists('apps/test-e2e/playwright.config.mts')
      ? 'apps/test-e2e/playwright.config.mts'
      : 'apps/test-e2e/playwright.config.ts';
    expect(host.read(cfg).toString()).toContain('process.env.BASE_URL');
    // Accessibility check (axe-core, WCAG 2.1 A/AA) rides along in the same e2e project.
    expect(host.exists('apps/test-e2e/src/a11y.spec.ts')).toBeTruthy();
    const pkgJson = JSON.parse(host.read('package.json').toString());
    expect(pkgJson.devDependencies['@axe-core/playwright']).toBeTruthy();
  }, 30000);

  it('AGENTS.md points at the current design system docs', async () => {
    await generator(host, options);
    const agents = host.read('apps/test/AGENTS.md').toString();
    expect(agents).toContain('design.alberta.ca/components');
    // guard against the retired ui-components.alberta.ca URL creeping back in
    expect(agents).not.toContain('ui-components.alberta.ca');
  }, 30000);

  it('wraps views in a shared AppLayout gutter (not a bare tag selector)', async () => {
    await generator(host, options);

    // Layout is a pattern component in the shared lib, not copied into the app.
    const layoutPath = 'libs/vue-components/src/lib/patterns/AppLayout.vue';
    expect(host.exists(layoutPath)).toBeTruthy();
    const layout = host.read(layoutPath).toString();
    // Three named width variants, token-driven padding.
    expect(layout).toContain('form-content');
    expect(layout).toContain('wide-content');
    expect(layout).toContain('--goa-space');
    // AppLayout must NOT own the skip-to-main-content landmark itself: it nests
    // inside AppSideMenu for --layout=internal, which already provides one, and
    // a second <main id="main-content"> would duplicate the landmark/id.
    expect(layout).not.toContain('id="main-content"');
    expect(layout).not.toContain('skip-link');

    // App.vue uses AppLayout and no longer relies on the `main > section` gutter
    // (which silently failed when a view's top-level tag wasn't <section>).
    // For --layout=header (the default), App.vue itself owns the skip-link
    // landmark instead, since there's no shell component to hold it.
    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toContain('AppLayout');
    expect(app).not.toContain('main > section');
    expect(app).toContain('href="#main-content"');
    expect(app).toContain('id="main-content"');
  });

  it('provisions the shared GoA wrapper library and points the app at it', async () => {
    await generator(host, options);

    // Wrappers live in a shared workspace lib, not copied into the app.
    const primitives = 'libs/vue-components/src/lib/primitives';
    for (const name of [
      'GoabInput',
      'GoabTextarea',
      'GoabDropdown',
      'GoabCheckbox',
      'GoabRadioGroup',
      'GoabButton',
      'GoabModal',
    ]) {
      expect(host.exists(`${primitives}/${name}.vue`)).toBeTruthy();
    }
    expect(host.exists('apps/test/src/components/goa')).toBeFalsy();

    // Real v-model wiring: bind :value and read the new value off the GoA event.
    const input = host.read(`${primitives}/GoabInput.vue`).toString();
    expect(input).toContain('defineModel');
    expect(input).toContain('.detail.value');

    // App resolves the lib alias (vite path plugin) and AGENTS.md points at it.
    const vite = host.read('apps/test/vite.config.ts').toString();
    expect(vite).toContain('nxViteTsPaths');
    const agents = host.read('apps/test/AGENTS.md').toString();
    expect(agents).toContain('/vue-components');
  }, 30000);

  it('provisions the shared app-shell pattern components and App.vue imports them', async () => {
    await generator(host, options);

    const patterns = 'libs/vue-components/src/lib/patterns';
    for (const name of [
      'AppLayout',
      'AppHeader',
      'AppFooter',
      'AppSideMenu',
      'SessionExpiredBanner',
    ]) {
      expect(host.exists(`${patterns}/${name}.vue`)).toBeTruthy();
    }

    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toContain(
      "import { AppHeader, AppLayout, AppFooter, SessionExpiredBanner } from '@proj/vue-components';",
    );
    expect(app).toContain('<AppHeader heading="test">');
    expect(app).toContain('<AppFooter />');
  }, 30000);

  it('--layout=internal generates an AppSideMenu shell instead of AppHeader/AppFooter', async () => {
    await generator(host, { ...options, layout: 'internal' });

    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toContain(
      "import { AppLayout, AppSideMenu, SessionExpiredBanner } from '@proj/vue-components';",
    );
    expect(app).not.toContain('AppHeader');
    expect(app).not.toContain('AppFooter');
    expect(app).not.toContain('goa-hero-banner');
    expect(app).toContain('<AppSideMenu');
    expect(app).toContain('heading="test"');
    expect(app).toContain(':account-items="accountItems"');
    expect(app).toContain('@item-click="onAccountItemClick"');
    // The content gutter is shared regardless of shell choice.
    expect(app).toContain('<AppLayout');
    // App.vue itself must not add a second skip-to-main-content landmark —
    // AppSideMenu (imported, not inlined) already owns the one and only
    // #main-content for this layout.
    expect(app).not.toContain('id="main-content"');
    expect(app).not.toContain('skip-link');

    const agents = host.read('apps/test/AGENTS.md').toString();
    expect(agents).toContain('--layout=internal');
    expect(agents).toContain('AppSideMenu');
  }, 30000);

  it('defaults --layout to header when omitted', async () => {
    await generator(host, options);
    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toContain('AppHeader');
    expect(app).not.toContain('AppSideMenu');
  }, 30000);

  it('wires SessionExpiredBanner to a session store fed by onAuthRefreshError (not onAuthLogout)', async () => {
    await generator(host, options);

    expect(host.exists('apps/test/src/stores/session.ts')).toBeTruthy();
    const store = host.read('apps/test/src/stores/session.ts').toString();
    expect(store).toContain("defineStore('session'");
    expect(store).toContain('markExpired');

    // Strip // comments — main.ts legitimately explains, in prose, why
    // onAuthLogout is the wrong hook; assert against the actual init code.
    const mainTsCode = host
      .read('apps/test/src/main.ts')
      .toString()
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(mainTsCode).toContain('onAuthRefreshError');
    // Regression guard: onAuthLogout only fires via the session-status iframe
    // (disabled here) or Cordova mode — it would never fire in this app.
    expect(mainTsCode).not.toContain('onAuthLogout');
    expect(mainTsCode).toContain('useSessionStore(pinia).markExpired()');

    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toContain('v-model:show="session.expired"');
    expect(app).toContain('@sign-in="signInAgain"');
    expect(app).toContain('@dismiss="session.dismiss"');
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
    expect(viteConfig).toContain(
      "isCustomElement: (tag) => tag.startsWith('goa-')",
    );
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

  it('renders the sign-in button in the app header (needs the "utilities" slot)', async () => {
    // goa-app-header (v2) only renders content placed in a named slot — GoA's
    // own design system docs put account/sign-in actions in "utilities" (vs.
    // "navigation" for nav links). A bare child with no slot attribute
    // renders nothing, silently dropping the sign-in button. AppHeader (the
    // shared pattern component) owns the native `slot="utilities"` div; App.vue
    // just feeds its named Vue slot. Regression guard for exactly that gap,
    // now spanning both files since AppHeader was extracted out of App.vue.
    await generator(host, options);
    const appHeader = host
      .read('libs/vue-components/src/lib/patterns/AppHeader.vue')
      .toString();
    expect(appHeader).toMatch(/<div[^>]*slot="utilities"[^>]*>[\s\S]*<slot name="utilities"/);

    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toMatch(/<template #utilities>[\s\S]*<goa-button-group/);
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
    const env = host
      .read('apps/test/src/environments/environment.ts')
      .toString();
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
    const proxyConf = JSON.parse(
      host.read('apps/test/vite.proxy.json').toString(),
    );
    expect(proxyConf['/test/'].target).toBe('http://localhost:3333');
    expect(proxyConf['/test/'].pathRewrite['^/test/']).toBe('/api/');
  });

  it('derives the nginx/dev proxy and the sandbox tag from --pairedProject alone', async () => {
    addProjectConfiguration(host, 'test-service', {
      root: 'apps/test-service',
    });
    await generator(host, { ...options, pairedProject: 'test-service' });

    const nginxConf = host.read('apps/test/public/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/test-service/');

    const proxyConf = JSON.parse(
      host.read('apps/test/vite.proxy.json').toString(),
    );
    expect(proxyConf['/api/'].target).toBe('http://localhost:3333');

    const config = readProjectConfiguration(host, 'test');
    expect(config.tags).toContain('adsp:proxy-service:test-service:3333');
  });

  it('throws when --pairedProject names a project that does not exist', async () => {
    await expect(
      generator(host, { ...options, pairedProject: 'no-such-service' }),
    ).rejects.toThrow();
  });

  it('throws when --pairedProject and an explicit --proxy collide on the same location', async () => {
    addProjectConfiguration(host, 'test-service', {
      root: 'apps/test-service',
    });
    await expect(
      generator(host, {
        ...options,
        pairedProject: 'test-service',
        proxy: { location: '/api/', proxyPass: 'http://other:9000/' },
      }),
    ).rejects.toThrow(/already derives a proxy/);
  });

  it('--pairedProject and an explicit --proxy for a different location coexist', async () => {
    addProjectConfiguration(host, 'test-service', {
      root: 'apps/test-service',
    });
    await generator(host, {
      ...options,
      pairedProject: 'test-service',
      proxy: { location: '/other/', proxyPass: 'http://other-service:9000/' },
    });

    const nginxConf = host.read('apps/test/public/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/test-service/');
    expect(nginxConf).toContain('http://other-service:9000/');
  });
});
