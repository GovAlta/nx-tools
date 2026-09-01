import {
  buildViteDevProxyModule,
  parseViteDevProxyRoutes,
  viteDevProxyRoutes,
  ViteProxyRoute,
} from './paired-project';

// Evaluates the emitted module the way @nx/vite does (it `require()`s the file
// named by proxyConfig), so these assert what Vite will actually receive rather
// than the text of a config that has to behave.
function loadProxy(source: string) {
  const module = { exports: {} };
  new Function('module', 'exports', source)(module, module.exports);
  return module.exports as Record<
    string,
    { target: string; secure: boolean; rewrite?: (path: string) => string }
  >;
}

describe('vite dev proxy module', () => {
  const route: ViteProxyRoute = {
    location: '/api/',
    target: 'http://localhost:3333',
    secure: false,
    rewriteTo: '/my-service/',
  };

  it('rewrites the location prefix to the service mount point', () => {
    const proxy = loadProxy(buildViteDevProxyModule([route]));
    expect(proxy['/api/'].target).toBe('http://localhost:3333');
    expect(proxy['/api/'].rewrite?.('/api/v1/things')).toBe(
      '/my-service/v1/things',
    );
  });

  it('replaces only the leading occurrence of the location', () => {
    const proxy = loadProxy(buildViteDevProxyModule([route]));
    expect(proxy['/api/'].rewrite?.('/api/a/api/b')).toBe('/my-service/a/api/b');
  });

  it('omits rewrite entirely when the upstream has no path prefix', () => {
    const proxy = loadProxy(
      buildViteDevProxyModule([
        { location: '/api/', target: 'http://localhost:3333', secure: false },
      ]),
    );
    expect(proxy['/api/'].rewrite).toBeUndefined();
  });

  it('derives routes from an nginx proxy configuration', () => {
    const [derived] = viteDevProxyRoutes([
      { location: '/api/', proxyPass: 'http://my-service:3333/my-service/' },
    ]);
    expect(derived).toEqual({
      location: '/api/',
      target: 'http://localhost:3333',
      secure: false,
      rewriteTo: '/my-service/',
    });
  });

  describe('parseViteDevProxyRoutes', () => {
    it('round-trips what buildViteDevProxyModule emits', () => {
      expect(parseViteDevProxyRoutes(buildViteDevProxyModule([route]))).toEqual([
        route,
      ]);
    });

    // The file on disk is the *formatted* output, not the string the builder
    // returned: formatFiles reflows each row across lines and adds a trailing
    // comma. A regex anchored on `}` immediately after the last field matches
    // nothing here, and the merge path would then drop every existing route --
    // silently un-pairing an already-paired frontend.
    it('parses the multi-line, trailing-comma layout formatFiles produces', () => {
      const formatted = `const routes = [
  {
    location: '/api/',
    target: 'http://localhost:3333',
    secure: false,
    rewriteTo: '/my-service/',
  },
];
`;
      expect(parseViteDevProxyRoutes(formatted)).toEqual([route]);
    });

    it('parses a formatted row that has no rewriteTo', () => {
      const formatted = `const routes = [
  {
    location: '/api/',
    target: 'http://localhost:3333',
    secure: false,
  },
];
`;
      expect(parseViteDevProxyRoutes(formatted)).toEqual([
        { location: '/api/', target: 'http://localhost:3333', secure: false },
      ]);
    });

    it('preserves an existing route when a second is appended', () => {
      const first = buildViteDevProxyModule([route]);
      const merged = buildViteDevProxyModule([
        ...parseViteDevProxyRoutes(first),
        {
          location: '/other/',
          target: 'http://localhost:4444',
          secure: false,
          rewriteTo: '/other-service/',
        },
      ]);
      const proxy = loadProxy(merged);
      expect(Object.keys(proxy)).toEqual(['/api/', '/other/']);
      expect(proxy['/api/'].rewrite?.('/api/v1/x')).toBe('/my-service/v1/x');
      expect(proxy['/other/'].rewrite?.('/other/v1/y')).toBe(
        '/other-service/v1/y',
      );
    });

    it('returns no routes for a file that is not this format', () => {
      expect(parseViteDevProxyRoutes('{ "/api/": { "target": "x" } }')).toEqual(
        [],
      );
    });
  });
});
