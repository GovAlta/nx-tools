import { createServer, IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';

const MOCK_CLIENT_UUID = 'aaaa1111-bbbb-cccc-dddd-eeee22223333';

function respond(method: string, url: string, res: ServerResponse, port: number): void {
  const base = `http://localhost:${port}`;

  // ── Directory service ─────────────────────────────────────────────────────
  if (url.startsWith('/directory/v2/namespaces/platform/entries')) {
    json(res, 200, [
      { urn: 'urn:ads:platform:tenant-service',         url: base },
      { urn: 'urn:ads:platform:tenant-service:v2',      url: base },
      { urn: 'urn:ads:platform:event-service',          url: `${base}/event` },
      { urn: 'urn:ads:platform:configuration-service',  url: `${base}/config` },
      { urn: 'urn:ads:platform:push-service',           url: `${base}/push` },
    ]);
    return;
  }

  // ── Tenant service ─────────────────────────────────────────────────────────
  // adsp-utils.ts uses  GET /v2/tenants (relative to tenant-service URL)
  // express-service.ts uses  GET /api/tenant/v2/tenants
  if (url.includes('/tenants')) {
    json(res, 200, { results: [{ name: 'test', realm: 'test' }] });
    return;
  }

  // ── Keycloak admin: list clients ──────────────────────────────────────────
  // GET /auth/admin/realms/{realm}/clients?clientId={id}
  // Returns [] so the generator proceeds to create the client.
  if (method === 'GET' && url.includes('/clients') && url.includes('clientId=')) {
    json(res, 200, []);
    return;
  }

  // ── Keycloak admin: create client ─────────────────────────────────────────
  if (method === 'POST' && /\/clients\/?$/.test(url.split('?')[0])) {
    res.writeHead(201, {
      'Content-Type': 'application/json',
      Location: `${base}/auth/admin/realms/test/clients/${MOCK_CLIENT_UUID}`,
    });
    res.end('{}');
    return;
  }

  // ── Keycloak admin: client secret ─────────────────────────────────────────
  if (url.includes('/client-secret')) {
    json(res, 200, { type: 'secret', value: 'mock-client-secret' });
    return;
  }

  // ── Keycloak admin: service-account-user ─────────────────────────────────
  if (url.includes('/service-account-user')) {
    json(res, 200, { id: 'mock-sa-user-id' });
    return;
  }

  // ── Keycloak admin: role-mappings ─────────────────────────────────────────
  if (url.includes('/role-mappings')) {
    json(res, 200, method === 'GET' ? [] : {});
    return;
  }

  // ── Keycloak admin: scope-mappings ────────────────────────────────────────
  if (url.includes('/scope-mappings')) {
    json(res, 200, method === 'GET' ? [] : {});
    return;
  }

  // ── Keycloak admin: client roles ──────────────────────────────────────────
  // GET role → 404 triggers creation; POST role → 201
  if (url.includes('/roles')) {
    if (method === 'GET') {
      json(res, 404, { error: 'Role not found' });
    } else {
      json(res, 201, {});
    }
    return;
  }

  // ── Keycloak admin: protocol-mappers ─────────────────────────────────────
  if (url.includes('/protocol-mappers')) {
    json(res, method === 'GET' ? 200 : 201, method === 'GET' ? [] : {});
    return;
  }

  // Default fallback
  json(res, 404, { error: 'Not found' });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export default async function globalSetup(): Promise<void> {
  let port = 0;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => respond(req.method ?? 'GET', req.url ?? '', res, port));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;

  // Inherited by child processes spawned by runNxCommandAsync.
  // environments.ts in nx-oc reads these to redirect all ADSP HTTP calls to
  // this server instead of the live gov.ab.ca endpoints.
  process.env.ADSP_E2E_DIRECTORY_URL = `http://localhost:${port}`;
  process.env.ADSP_E2E_ACCESS_URL = `http://localhost:${port}`;

  (global as Record<string, unknown>).__mockAdspServer = server;
}
