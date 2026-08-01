import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { insertVueRoute } from './vue-router';

const ROUTER_FIXTURE = `import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: HomeView },
  ],
});

export default router;
`;

describe('insertVueRoute', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    host.write('apps/test/src/router/index.ts', ROUTER_FIXTURE);
  });

  it('inserts a new route ahead of the existing ones, with a requiresAuth meta', () => {
    insertVueRoute(host, 'apps/test', 'test', {
      path: '/things/:id',
      componentImportPath: '../views/ThingView.vue',
      requiresAuth: true,
    });

    const routerTs = host.read('apps/test/src/router/index.ts').toString();
    expect(routerTs).toContain("path: '/things/:id'");
    expect(routerTs).toContain(
      "component: () => import('../views/ThingView.vue')",
    );
    expect(routerTs).toContain('meta: { requiresAuth: true }');
    expect(routerTs).toContain("{ path: '/', component: HomeView }");
  });

  it('omits the meta line when requiresAuth is not set', () => {
    insertVueRoute(host, 'apps/test', 'test', {
      path: '/public-things',
      componentImportPath: '../views/ThingsListView.vue',
    });

    const routerTs = host.read('apps/test/src/router/index.ts').toString();
    expect(routerTs).not.toContain('requiresAuth');
  });

  it('throws a clear error when the project has no router/index.ts', () => {
    host.write('apps/no-router/src/main.ts', '// no router here\n');
    expect(() =>
      insertVueRoute(host, 'apps/no-router', 'no-router', {
        path: '/x',
        componentImportPath: '../views/XView.vue',
      }),
    ).toThrow(/router\/index\.ts/);
  });

  it('throws when routes: [ has been renamed or removed', () => {
    host.write('apps/test/src/router/index.ts', 'export default {};\n');
    expect(() =>
      insertVueRoute(host, 'apps/test', 'test', {
        path: '/x',
        componentImportPath: '../views/XView.vue',
      }),
    ).toThrow(/routes: \[/);
  });
});
