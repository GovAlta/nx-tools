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
    // The gutter is goa-page-block's job now: it supplies the centering, the
    // max-width and a responsive horizontal gutter. The named variants stay the
    // public API, mapped to the widths the element takes.
    expect(layout).toContain('<goa-page-block');
    expect(layout).toContain("form: '640px'");
    expect(layout).toContain("page: '1000px'");
    expect(layout).toContain("wide: '1200px'");
    // Vertical padding is not part of goa-page-block, so this component keeps it
    // -- the same thing GoA's own public-form reference does.
    expect(layout).toContain('--goa-space');
    expect(layout).toContain('padding-block');
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
    // The public shell is goa-one-column-layout, which owns the page's flex
    // column, sticky footer and <main> landmark. That <main> is in its shadow
    // DOM, so the skip link targets an id'd wrapper in the slotted content --
    // a plain div, so the page still has exactly one main landmark.
    expect(app).toContain('<goa-one-column-layout>');
    expect(app).toContain('<section slot="header">');
    expect(app).toContain('<section slot="footer">');
    expect(app).toContain('href="#main-content"');
    expect(app).toContain('<div id="main-content">');
    expect(app).not.toContain('<main id="main-content">');
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

  it('the header layout has no side-menu nav array (there is no side menu)', async () => {
    await generator(host, options);
    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).not.toContain('primaryItems');
  });

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
    // A plain, editable nav array -- the app's own list, seeded with Home and
    // appended to by each staff view generator. Not derived from the router:
    // nav order, grouping and labels are the owning team's decisions.
    expect(app).toContain(':primary-items="primaryItems"');
    expect(app).toContain('const primaryItems = [');
    // The icon is not decoration: goa-work-side-menu-item renders a blank
    // item without one.
    expect(app).toContain("{ label: 'Home', to: '/', icon: 'home' },");
    expect(app).toContain('@item-click="onItemClick"');
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

  it('inits Keycloak with checkLoginIframe disabled and silent SSO enabled', async () => {
    await generator(host, options);
    const code = host.read('apps/test/src/main.ts').toString();
    // checkLoginIframe: false — disables 5s background polling; session expiry via refresh token is sufficient.
    expect(code).toContain('checkLoginIframe: false');
    // silentCheckSsoRedirectUri — auto-authenticates on load; 3p-cookie probe falls back to a redirect if blocked.
    expect(code).toContain('silentCheckSsoRedirectUri');
    expect(code).toContain("onLoad: 'check-sso'");
    expect(code).toContain("pkceMethod: 'S256'");
    expect(host.exists('apps/test/public/silent-check-sso.html')).toBeTruthy();
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

  it('generates a useApi composable that handles token refresh and auth headers', async () => {
    await generator(host, options);
    expect(host.exists('apps/test/src/composables/useApi.ts')).toBeTruthy();
    const useApi = host.read('apps/test/src/composables/useApi.ts').toString();
    // Token refresh and auth header injection are encapsulated here, not at each call site.
    expect(useApi).toContain('updateToken');
    expect(useApi).toContain('Authorization');
    expect(useApi).toContain('apiFetch');
    // The glue layer: views state paging/sorting in domain terms and this block
    // maps them to the wire. Its absence is what let query-param names and
    // response-envelope keys get inlined into every generated view.
    expect(useApi).toContain('apiConvention');
    expect(useApi).toContain('THE GLUE LAYER');
    for (const method of [
      'function list',
      'function get',
      'function save',
      'function action',
    ]) {
      expect(useApi).toContain(method);
    }
    // The documented escape hatch for a limit/offset backend.
    expect(useApi).toContain("params.set('offset'");

    // HomeView delegates to the composable — raw token wiring must not leak into views.
    const homeView = host.read('apps/test/src/views/HomeView.vue').toString();
    expect(homeView).toContain('useApi');
    expect(homeView).toContain('apiFetch');
    expect(homeView).not.toContain('updateToken');
    expect(homeView).not.toContain('Authorization');
  }, 30000);

  it('router guard waits for Keycloak readiness before making auth decisions', async () => {
    await generator(host, options);
    const router = host.read('apps/test/src/router/index.ts').toString();
    // Returning `true` when !kc.ready lets unauthenticated direct-URL loads through
    // to protected routes before Keycloak has finished init. The guard must block
    // and wait (async watch) instead of allowing.
    expect(router).toContain('async');
    expect(router).toContain('kc.ready');
    expect(router).not.toMatch(/if\s*\(!kc\.ready\)\s*return\s*true/);
    expect(router).toContain('watch');
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
    // HomeView's <goa-hero-banner backgroundurl="/assets/banner.jpg"> and
    // index.html's favicon.ico are absolute-URL string refs, so they must be in
    // the Vite publicDir (public/) — a src/assets file is not served at /assets.
    const homeView = host.read('apps/test/src/views/HomeView.vue').toString();
    const bannerUrl = homeView.match(/backgroundurl="([^"]+)"/)?.[1];
    expect(bannerUrl).toBe('/assets/banner.jpg');
    expect(host.exists('apps/test/public/assets/banner.jpg')).toBeTruthy();
    expect(host.exists('apps/test/src/assets/banner.jpg')).toBeFalsy();
    expect(host.exists('apps/test/public/favicon.ico')).toBeTruthy();
  }, 30000);

  it('the hero banner is home-page content, not part of the persistent app shell', async () => {
    // Real GovAlta-Pronghorn source (both the canonical template and an
    // independently-evolved production app) puts goa-hero-banner only inside
    // HomeView -- never in App.vue/AppLayout -- so it shows once on the
    // landing page, not repeated on every interior route.
    await generator(host, options);
    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).not.toContain('goa-hero-banner');
    const homeView = host.read('apps/test/src/views/HomeView.vue').toString();
    expect(homeView).toContain('goa-hero-banner');
  }, 30000);

  it('--layout=internal App.vue uses a unified onItemClick that routes nav items and signs in/out for account items', async () => {
    // AppSideMenu emits one itemClick for all slots. A dedicated onAccountItemClick breaks
    // once primaryItems are added — primary nav clicks fire login()/logout() instead of routing.
    // The generated handler must dispatch by item.to.
    await generator(host, { ...options, layout: 'internal' });
    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toContain('onItemClick');
    expect(app).toContain('router.push');
    expect(app).not.toContain('onAccountItemClick');
    // Routing branch: items with `to` navigate
    expect(app).toContain('item.to');
    // Auth branch: items without `to` fall through to sign-in/out
    expect(app).toContain('kc.authenticated');
  }, 30000);

  it('--layout=internal has no hero banner anywhere, including on HomeView', async () => {
    await generator(host, { ...options, layout: 'internal' });
    const homeView = host.read('apps/test/src/views/HomeView.vue').toString();
    expect(homeView).not.toContain('goa-hero-banner');
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

  it('renders the sign-in button in the app header (needs version="2" and the "utilities" slot)', async () => {
    // goa-app-header defaults to version="1", which does not render the
    // utilities area at all — the sign-in button is silently invisible.
    // version="2" is required. AppHeader (the shared pattern component)
    // owns both the version attribute and the native slot="utilities" div;
    // App.vue just feeds its named Vue slot.
    await generator(host, options);
    const appHeader = host
      .read('libs/vue-components/src/lib/patterns/AppHeader.vue')
      .toString();
    expect(appHeader).toContain('version="2"');
    expect(appHeader).toMatch(
      /<div[^>]*slot="utilities"[^>]*>[\s\S]*<slot name="utilities"/,
    );

    const app = host.read('apps/test/src/App.vue').toString();
    expect(app).toMatch(/<template #utilities>[\s\S]*<goa-button-group/);
  }, 30000);

  it('WorkspaceTable uses goa-pagination version="2" (compact size; v1 default renders oversized buttons)', async () => {
    // goa-pagination defaults to version="1" (normal/default size). version="2"
    // uses compact size, matching the React wrapper which always passes version="2".
    await generator(host, options);
    const table = host
      .read('libs/vue-components/src/lib/patterns/WorkspaceTable.vue')
      .toString();
    expect(table).toContain('version="2"');
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

  // Regression: this was a JSON file carrying `pathRewrite`, which is
  // webpack-dev-server syntax. Vite has no such key and ignores unknown ones
  // silently, so the dev server proxied to the right host and forwarded the path
  // unrewritten -- every generated API call 404'd, with no warning. The fix has
  // to be a module because the thing Vite needs is a function.
  it('writes an executable vite dev proxy module whose rewrite actually rewrites', async () => {
    await generator(host, {
      ...options,
      proxy: { location: '/test/', proxyPass: 'http://test-service:3333/api/' },
    });
    expect(host.exists('apps/test/vite.proxy.cjs')).toBeTruthy();
    // The inert JSON form must not be left beside it.
    expect(host.exists('apps/test/vite.proxy.json')).toBeFalsy();

    const source = host.read('apps/test/vite.proxy.cjs').toString();
    expect(source).not.toContain('pathRewrite');

    // Evaluate it the way @nx/vite does (require) and exercise the function,
    // rather than asserting on the text of a config that has to *behave*.
    const module = { exports: {} };
    new Function('module', 'exports', source)(module, module.exports);
    const proxy = module.exports as Record<
      string,
      { target: string; rewrite: (path: string) => string }
    >;
    expect(proxy['/test/'].target).toBe('http://localhost:3333');
    expect(typeof proxy['/test/'].rewrite).toBe('function');
    expect(proxy['/test/'].rewrite('/test/v1/things')).toBe('/api/v1/things');
    // Only the leading location is replaced, not a later occurrence of it.
    expect(proxy['/test/'].rewrite('/test/a/test/b')).toBe('/api/a/test/b');
  });

  it('derives the nginx/dev proxy and the sandbox tag from --pairedProject alone', async () => {
    addProjectConfiguration(host, 'test-service', {
      root: 'apps/test-service',
    });
    await generator(host, { ...options, pairedProject: 'test-service' });

    const nginxConf = host.read('apps/test/public/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/test-service/');

    const source = host.read('apps/test/vite.proxy.cjs').toString();
    const module = { exports: {} };
    new Function('module', 'exports', source)(module, module.exports);
    const proxy = module.exports as Record<
      string,
      { target: string; rewrite: (path: string) => string }
    >;
    expect(proxy['/api/'].target).toBe('http://localhost:3333');
    // /api/v1/... must reach the service's own mount point, which is what
    // useApi's base path is built against.
    expect(proxy['/api/'].rewrite('/api/v1/claims')).toBe(
      '/test-service/v1/claims',
    );

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

  // Regression: the shell projects into goa-one-column-layout's native `header`
  // and `footer` slots. The rule was only turned off for the vue-components lib,
  // so when the shell adopted the element `nx lint` began failing on unmodified
  // generator output -- two `vue/no-deprecated-slot-attribute` errors in the
  // generator's own App.vue. Asserted for both layouts: the attribute is
  // legitimate custom-element usage in either shell, and scoping the override to
  // the one template that happens to emit it today is what caused the bug.
  it.each(['header', 'internal'] as const)(
    'disables vue/no-deprecated-slot-attribute for a %s-layout app',
    async (layout) => {
      await generator(host, { ...options, layout });
      // create-nx-workspace's current default is flat config, so that is what
      // @nx/vue writes for the app; read whichever is actually in effect rather
      // than assuming a filename.
      const config =
        host.read('apps/test/eslint.config.mjs')?.toString() ??
        host.read('apps/test/.eslintrc.json')?.toString() ??
        '';
      // Quote style differs between the flat-config writer and the legacy JSON
      // one, so match the rule and its value together rather than a literal.
      expect(config).toMatch(
        /vue\/no-deprecated-slot-attribute["']?\s*:\s*["']off["']/,
      );
    },
  );

  it('emits native slot attributes the disabled rule would otherwise flag', async () => {
    await generator(host, { ...options, layout: 'header' });
    const app = host.read('apps/test/src/App.vue')?.toString() ?? '';
    expect(app).toContain('slot="header"');
    expect(app).toContain('slot="footer"');
  });
});
