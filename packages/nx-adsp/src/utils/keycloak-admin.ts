// Keycloak admin REST API helpers used at generation time to provision clients.
// All calls are best-effort: failures are logged and the generator continues.

interface KeycloakClientRepresentation {
  id: string;
  clientId: string;
}

interface ProtocolMapperRepresentation {
  id?: string;
  name: string;
  protocol: string;
  protocolMapper: string;
  config?: Record<string, string>;
}

interface ClientSecretRepresentation {
  type: string;
  value: string;
}

async function listClients(
  accessServiceUrl: string,
  realm: string,
  clientId: string,
  accessToken: string
): Promise<KeycloakClientRepresentation[]> {
  const { default: axios } = await import('axios');
  const url = new URL(`/auth/admin/realms/${realm}/clients`, accessServiceUrl).href;
  const { data } = await axios.get<KeycloakClientRepresentation[]>(url, {
    params: { clientId },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

async function createClient(
  accessServiceUrl: string,
  realm: string,
  representation: Record<string, unknown>,
  accessToken: string
): Promise<string> {
  const { default: axios } = await import('axios');
  const url = new URL(`/auth/admin/realms/${realm}/clients`, accessServiceUrl).href;
  const response = await axios.post<void>(url, representation, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const location = response.headers['location'] as string;
  return location.split('/').pop();
}

async function ensureClientRole(
  accessServiceUrl: string,
  realm: string,
  clientUuid: string,
  roleName: string,
  description: string,
  accessToken: string
): Promise<void> {
  const { default: axios } = await import('axios');
  const baseUrl = new URL(`/auth/admin/realms/${realm}/clients/${clientUuid}/roles`, accessServiceUrl).href;
  try {
    await axios.get(`${baseUrl}/${encodeURIComponent(roleName)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) {
      await axios.post(baseUrl, { name: roleName, description }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } else {
      throw err;
    }
  }
}

async function assignRoleToServiceAccount(
  accessServiceUrl: string,
  realm: string,
  userId: string,
  platformClientId: string,
  roleName: string,
  accessToken: string
): Promise<void> {
  const { default: axios } = await import('axios');

  const platformClients = await listClients(accessServiceUrl, realm, platformClientId, accessToken);
  const platformClient = platformClients.find((c) => c.clientId === platformClientId);
  if (!platformClient) {
    process.stdout.write(
      `[nx-adsp] Platform client '${platformClientId}' not found in realm — skipping role assignment.\n`
    );
    return;
  }

  const roleUrl = new URL(
    `/auth/admin/realms/${realm}/clients/${platformClient.id}/roles/${encodeURIComponent(roleName)}`,
    accessServiceUrl
  ).href;
  const { data: role } = await axios.get<{ id: string; name: string }>(roleUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const mappingsUrl = new URL(
    `/auth/admin/realms/${realm}/users/${userId}/role-mappings/clients/${platformClient.id}`,
    accessServiceUrl
  ).href;
  const { data: existing } = await axios.get<{ id: string; name: string }[]>(mappingsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (existing.some((r) => r.name === roleName)) {
    return;
  }

  await axios.post(mappingsUrl, [{ id: role.id, name: roleName }], {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  process.stdout.write(
    `[nx-adsp] Assigned '${platformClientId}:${roleName}' to service account.\n`
  );
}

async function ensureServiceAccountRoles(
  accessServiceUrl: string,
  realm: string,
  serviceClientUuid: string,
  roles: Array<{ platformClientId: string; roleName: string }>,
  accessToken: string
): Promise<void> {
  const { default: axios } = await import('axios');

  const userUrl = new URL(
    `/auth/admin/realms/${realm}/clients/${serviceClientUuid}/service-account-user`,
    accessServiceUrl
  ).href;
  const { data: user } = await axios.get<{ id: string }>(userUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  await Promise.all(
    roles.map(({ platformClientId, roleName }) =>
      assignRoleToServiceAccount(accessServiceUrl, realm, user.id, platformClientId, roleName, accessToken)
    )
  );
}

async function getClientSecret(
  accessServiceUrl: string,
  realm: string,
  clientUuid: string,
  accessToken: string
): Promise<string> {
  const { default: axios } = await import('axios');
  const url = new URL(
    `/auth/admin/realms/${realm}/clients/${clientUuid}/client-secret`,
    accessServiceUrl
  ).href;
  const { data } = await axios.get<ClientSecretRepresentation>(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data.value;
}

function logAdminError(clientId: string, err: unknown): void {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403) {
    process.stdout.write(
      `[nx-adsp] Cannot manage client '${clientId}' — insufficient permissions.\n` +
        `         Create it manually in the ADSP admin portal.\n`
    );
  } else {
    process.stdout.write(
      `[nx-adsp] Failed to provision client '${clientId}': ${(err as Error)?.message ?? err}\n`
    );
  }
}

/**
 * Ensures a confidential service-account client exists in the tenant realm.
 * Returns the client secret when a new client is created; returns null when
 * the client already existed or the operation could not be completed.
 */
export async function ensureServiceClient(
  accessServiceUrl: string,
  realm: string,
  clientId: string,
  accessToken: string | undefined
): Promise<string | null> {
  if (!accessToken) return null;

  try {
    const existing = await listClients(accessServiceUrl, realm, clientId, accessToken);
    const platformRoles = [
      { platformClientId: 'urn:ads:platform:tenant-service', roleName: 'platform-service' },
      { platformClientId: 'urn:ads:platform:event-service', roleName: 'event-sender' },
      { platformClientId: 'urn:ads:platform:configuration-service', roleName: 'configured-service' },
    ];

    const existingClient = existing.find((c) => c.clientId === clientId);
    if (existingClient) {
      process.stdout.write(`[nx-adsp] Client '${clientId}' already exists.\n`);
      await ensureClientRole(
        accessServiceUrl,
        realm,
        existingClient.id,
        'example-role',
        'Example RBAC role — replace with roles relevant to your service.',
        accessToken
      );
      await Promise.all([
        ensureServiceAccountRoles(accessServiceUrl, realm, existingClient.id, platformRoles, accessToken),
        ensureAudienceMapper(accessServiceUrl, realm, clientId, 'urn:ads:platform:push-service', accessToken),
      ]);
      return getClientSecret(accessServiceUrl, realm, existingClient.id, accessToken);
    }

    const uuid = await createClient(
      accessServiceUrl,
      realm,
      {
        clientId,
        enabled: true,
        protocol: 'openid-connect',
        publicClient: false,
        serviceAccountsEnabled: true,
        directAccessGrantsEnabled: false,
        standardFlowEnabled: false,
      },
      accessToken
    );

    const secret = await getClientSecret(accessServiceUrl, realm, uuid, accessToken);
    await ensureClientRole(
      accessServiceUrl,
      realm,
      uuid,
      'example-role',
      'Example RBAC role — replace with roles relevant to your service.',
      accessToken
    );
    await Promise.all([
      ensureServiceAccountRoles(accessServiceUrl, realm, uuid, platformRoles, accessToken),
      ensureAudienceMapper(accessServiceUrl, realm, clientId, 'urn:ads:platform:push-service', accessToken),
    ]);
    process.stdout.write(`[nx-adsp] Created service client '${clientId}'.\n`);
    return secret;
  } catch (err) {
    logAdminError(clientId, err);
    return null;
  }
}

/**
 * Ensures a public (browser-based) client exists in the tenant realm.
 * No-ops if the client already exists.
 * Uses http://localhost:4200/* as the default redirect URI for local development;
 * add production URIs via the ADSP admin portal after deployment.
 */
export async function ensurePublicClient(
  accessServiceUrl: string,
  realm: string,
  clientId: string,
  accessToken: string | undefined
): Promise<void> {
  if (!accessToken) return;

  try {
    const existing = await listClients(accessServiceUrl, realm, clientId, accessToken);
    if (existing.some((c) => c.clientId === clientId)) {
      process.stdout.write(`[nx-adsp] Client '${clientId}' already exists.\n`);
      return;
    }

    await createClient(
      accessServiceUrl,
      realm,
      {
        clientId,
        enabled: true,
        protocol: 'openid-connect',
        publicClient: true,
        serviceAccountsEnabled: false,
        directAccessGrantsEnabled: false,
        standardFlowEnabled: true,
        redirectUris: ['http://localhost:4200/*'],
        webOrigins: ['+'],
        attributes: {
          'pkce.code.challenge.method': 'S256',
          'post.logout.redirect.uris': 'http://localhost:4200/*',
        },
      },
      accessToken
    );

    process.stdout.write(`[nx-adsp] Created public client '${clientId}'.\n`);
  } catch (err) {
    logAdminError(clientId, err);
  }
}

/**
 * Ensures the frontend (public) client has a protocol mapper that includes the
 * backend service client ID in the `aud` claim of issued access tokens.
 * Required so the backend can validate tokens obtained via the frontend login.
 */
export async function ensureAudienceMapper(
  accessServiceUrl: string,
  realm: string,
  frontendClientId: string,
  backendClientId: string,
  accessToken: string | undefined
): Promise<void> {
  if (!accessToken) return;

  try {
    const existing = await listClients(accessServiceUrl, realm, frontendClientId, accessToken);
    const client = existing.find((c) => c.clientId === frontendClientId);
    if (!client) {
      process.stdout.write(
        `[nx-adsp] Client '${frontendClientId}' not found — skipping audience mapper.\n`
      );
      return;
    }

    const { default: axios } = await import('axios');
    const mappersUrl = new URL(
      `/auth/admin/realms/${realm}/clients/${client.id}/protocol-mappers/models`,
      accessServiceUrl
    ).href;

    const { data: mappers } = await axios.get<ProtocolMapperRepresentation[]>(mappersUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const alreadyMapped = mappers.some(
      (m) => m.config?.['included.client.audience'] === backendClientId
    );
    if (alreadyMapped) {
      process.stdout.write(
        `[nx-adsp] Audience mapper for '${backendClientId}' already present on '${frontendClientId}'.\n`
      );
      return;
    }

    await axios.post<void>(
      mappersUrl,
      {
        name: `audience-${backendClientId}`,
        protocol: 'openid-connect',
        protocolMapper: 'oidc-audience-mapper',
        consentRequired: false,
        config: {
          'included.client.audience': backendClientId,
          'id.token.claim': 'false',
          'access.token.claim': 'true',
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    process.stdout.write(
      `[nx-adsp] Added audience mapper '${backendClientId}' → '${frontendClientId}'.\n`
    );
  } catch (err) {
    logAdminError(frontendClientId, err);
  }
}

/**
 * Adds a backend client role to the frontend client's scope so that users with
 * the role have it included in tokens issued via the frontend, and Keycloak
 * includes the backend client in the `aud` claim for those users.
 * Used alongside ensureAudienceMapper: the mapper covers all authenticated users,
 * the scope mapping wires up the RBAC demo for users assigned the role.
 */
export async function ensureClientRoleScope(
  accessServiceUrl: string,
  realm: string,
  frontendClientId: string,
  backendClientId: string,
  roleName: string,
  accessToken: string | undefined
): Promise<void> {
  if (!accessToken) return;

  try {
    const { default: axios } = await import('axios');

    const [frontendClients, backendClients] = await Promise.all([
      listClients(accessServiceUrl, realm, frontendClientId, accessToken),
      listClients(accessServiceUrl, realm, backendClientId, accessToken),
    ]);

    const frontendClient = frontendClients.find((c) => c.clientId === frontendClientId);
    const backendClient = backendClients.find((c) => c.clientId === backendClientId);

    if (!frontendClient || !backendClient) {
      process.stdout.write(`[nx-adsp] Could not find clients for role scope mapping — skipping.\n`);
      return;
    }

    const roleUrl = new URL(
      `/auth/admin/realms/${realm}/clients/${backendClient.id}/roles/${encodeURIComponent(roleName)}`,
      accessServiceUrl
    ).href;
    const { data: role } = await axios.get<{ id: string; name: string }>(roleUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const scopeUrl = new URL(
      `/auth/admin/realms/${realm}/clients/${frontendClient.id}/scope-mappings/clients/${backendClient.id}`,
      accessServiceUrl
    ).href;
    const { data: existingMappings } = await axios.get<{ id: string; name: string }[]>(scopeUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (existingMappings.some((r) => r.name === roleName)) {
      process.stdout.write(
        `[nx-adsp] Scope mapping '${backendClientId}:${roleName}' already present on '${frontendClientId}'.\n`
      );
      return;
    }

    await axios.post(scopeUrl, [{ id: role.id, name: roleName }], {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    process.stdout.write(
      `[nx-adsp] Added scope mapping '${backendClientId}:${roleName}' to '${frontendClientId}'.\n`
    );
  } catch (err) {
    logAdminError(frontendClientId, err);
  }
}
