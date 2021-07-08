# Workspace

This project was generated using [Nx](https://nx.dev).

## Generate an application using nx-adsp

Run `npm run setup` to build the latest distribution from nx-tools and to run npm install.
Run `npx nx g @abgov/nx-adsp:angular-app my-test-ang-app --tenant 2a9a2c30-a094-4097-9247-8d41b39cb80e` to generate an application.

There is a sample app in the ./apps/my-ang-app folder

## Running the sample app

Run `npm install`
Run `nx serve test-ang-app`

## Configuring your generated app - REQUIRED

Ensure environment.ts points to a running tenant-management-api, keycloak access app and an existing realm

eg

export const environment = {
  production: false,
  access: {
    url: 'https://access-dev.os99.gov.ab.ca/auth',
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
