import type { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';

export interface Schema {
  name: string;
  env: EnvironmentName;
  accessToken?: string;
  /** Keycloak realm UUID. When provided with tenant, skips interactive tenant selection. */
  tenantRealm?: string;
  /** ADSP tenant name (e.g. 'my-org'). Required when tenantRealm is provided. */
  tenant?: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  adsp: AdspConfiguration;
}
