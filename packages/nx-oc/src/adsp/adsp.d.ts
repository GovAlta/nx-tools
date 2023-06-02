export interface AdspConfiguration {
  tenant: string;
  tenantRealm: string;
  accessServiceUrl: string;
  directoryServiceUrl: string;
}

export type AdspOptions = {
  adsp: AdspConfiguration;
};
