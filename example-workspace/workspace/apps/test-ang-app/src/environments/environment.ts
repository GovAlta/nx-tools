// This file can be replaced during build by using the `fileReplacements` array.
// When building for production, this file is replaced with `environment.prod.ts`.

export const environment = {
  production: false,
  access: {
    url: 'https://access-dev.os99.gov.ab.ca',
    realm: '2a9a2c30-a094-4097-9247-8d41b39cb80e',
    client_id: 'urn:ads:platform:tenant-admin-app',
  },
  tenantApi: {
    host: 'http://localhost:3333',
    endpoints: {
      tenantNameByRealm: '/api/tenant/v1/realm',
    },
  },
};
