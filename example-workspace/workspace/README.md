# Workspace

This project was generated using [Nx](https://nx.dev).

## Generate an application using nx-adsp

Run `npm run setup` to build the latest distribution from nx-tools and to run npm install.
Run `npx nx g @abgov/nx-adsp:angular-app my-test-ang-app --tenant 2a9a2c30-a094-4097-9247-8d41b39cb80e` to generate an application.

my-test-ang-app is the app name of the angular app you wish to generate.
The --tenant flag is used to specify the keycloak realm of the tenant that you wish to be able to log into. A tenant represents a distinct separation of services with the Alberta Digital Service Platform.

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

# Ensure keycloak redirect uri is configured correctly - REQUIRED

your localhost has to listed in the Valid Redirect URIs inside Urn:ads:platform:tenant-admin-app (localhost:4200 may be listed by default)

go to

- https://access-dev.os99.gov.ab.ca/auth/admin/master/console/#/realms/core/clients/bf527c99-040e-4137-9c67-4d57bf3f7faf

Add your localhost to 'Valid Redirect URIs'
