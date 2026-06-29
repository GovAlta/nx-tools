import type { AdspConfiguration, EnvironmentName } from '@abgov/nx-oc';

export type DatabaseType = 'none' | 'postgres' | 'mongo';

export interface Schema {
  name: string;
  env: EnvironmentName;
  accessToken?: string;
  /** Keycloak realm UUID. When provided with tenant, skips interactive tenant selection. */
  tenantRealm?: string;
  /** ADSP tenant name (e.g. 'my-org'). Required when tenantRealm is provided. */
  tenant?: string;
  /** When true, skip the agent interaction. Used by composite generators that run the agent themselves. */
  skipAgent?: boolean;
  /** Database to scaffold. Defaults to 'none'. */
  database?: DatabaseType;
  /** Name of the paired frontend app project, set by composite generators (pevn, pern, pean, etc.). */
  pairedProject?: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  adsp: AdspConfiguration;
  database: DatabaseType;
}
