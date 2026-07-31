export interface Schema {
  githubActions?: boolean;
  provisionSecrets?: boolean;
  project?: string;
  openshiftServer?: string;
  openshiftToken?: string;
  openshiftNamespace?: string;
  adspEnv?: 'dev' | 'test' | 'prod';
  adspTenantName?: string;
  adspTenantRealm?: string;
  adspClientSecret?: string;
  maxIterations?: number;
  accessToken?: string;
  overwriteExisting?: boolean;
}
