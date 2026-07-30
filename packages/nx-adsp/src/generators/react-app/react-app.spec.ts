import { readProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import * as utils from '@abgov/nx-oc';
import { environments } from '@abgov/nx-oc';
import { Schema } from './schema';
import generator from './react-app';

jest.mock('@abgov/nx-oc');
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

describe('React App Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
  };

  it('can run', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
  }, 30000);

  it('loads design tokens before web-components CSS, so goa-* elements are actually styled', async () => {
    // @abgov/web-components' own CSS only defines rules in terms of --goa-*
    // custom properties — without the tokens stylesheet also loaded, every
    // goa-* element (header, banner, buttons) renders with no spacing at
    // all, not just unbranded. Regression guard for exactly that gap.
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    const mainTsx = host.read('apps/test/src/main.tsx').toString();
    expect(mainTsx).toContain("import '@abgov/design-tokens/dist/tokens.css';");
    expect(mainTsx).toContain("import '@abgov/web-components/index.css';");
  }, 30000);

  it('renders the sign-in button in the app header (needs the "utilities" slot)', async () => {
    // GoabAppHeader (v2) only renders content placed in a named slot — GoA's
    // own design system docs put account/sign-in actions in "utilities" (vs.
    // "navigation" for nav links). A bare child with no slot attribute
    // renders nothing, silently dropping the sign-in button. Regression
    // guard for exactly that gap.
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    const appTsx = host.read('apps/test/src/app/app.tsx').toString();
    expect(appTsx).toMatch(/<div slot="utilities">[\s\S]*<GoabButtonGroup/);
  }, 30000);

  it("runs nx-adsp's own workspace-root setup (ADSP SDK MCP server + VS Code settings)", async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);

    expect(host.exists('.mcp.json')).toBeTruthy();
    expect(host.exists('.vscode/settings.json')).toBeTruthy();
  }, 30000);

  it('scaffolds a Playwright e2e project (consistent across frontends)', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
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
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, options);
    const agents = host.read('apps/test/AGENTS.md').toString();
    expect(agents).toContain('design.alberta.ca/components');
    // guard against the retired ui-components.alberta.ca URL creeping back in
    expect(agents).not.toContain('ui-components.alberta.ca');
  }, 30000);

  it('can add nginx proxy', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, {
      ...options,
      proxy: {
        location: '/test/',
        proxyPass: 'http://test-service:3333/',
      },
    });

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
    expect(host.read('apps/test/nginx.conf').toString()).toContain(
      'http://test-service:3333/',
    );
  });

  it('can add multiple nginx proxy', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, {
      ...options,
      proxy: [
        {
          location: '/test/',
          proxyPass: 'http://test-service:3333/',
        },
        {
          location: '/test2/',
          proxyPass: 'http://test-service2:3333/',
        },
      ],
    });

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/nginx.conf')).toBeTruthy();
    const nginxConf = host.read('apps/test/nginx.conf').toString();
    expect(nginxConf).toContain('http://test-service:3333/');
    expect(nginxConf).toContain('http://test-service2:3333/');
  });

  it('can add webpack dev server proxy', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(host, {
      ...options,
      proxy: {
        location: '/test/',
        proxyPass: 'http://test-service:3333/api/',
      },
    });

    const config = readProjectConfiguration(host, 'test');
    expect(config.root).toBe('apps/test');

    expect(host.exists('apps/test/proxy.conf.json')).toBeTruthy();

    const proxyConf = JSON.parse(
      host.read('apps/test/proxy.conf.json').toString(),
    );
    expect(proxyConf['/test/'].target).toBe('http://localhost:3333');
    expect(proxyConf['/test/'].pathRewrite['^/test/']).toBe('/api/');
  });
});
