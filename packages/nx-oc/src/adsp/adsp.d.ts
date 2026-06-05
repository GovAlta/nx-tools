export interface AdspConfiguration {
  tenant: string;
  tenantRealm: string;
  accessServiceUrl: string;
  directoryServiceUrl: string;
  /** Access token from the login performed during configuration retrieval. */
  accessToken?: string;
}

export type AdspOptions = {
  adsp: AdspConfiguration;
};
