# About this project
This is the Government of Alberta - DIO - Nx plugin for ADSP apps.

The plugin includes generators for application, service, and fullstack solution quick starts. If the peer dependency `@abgov/nx-oc` is found, then OpenShift yml files are also included in the quickstarts.

## TLDR

1. Create your Nx workspace using `npx create-nx-workspace my-workspace`
2. Install plugin: `npm i -D @abgov/nx-adsp`
3. Generate a quick start `npx g @abgov/nx-adsp:express-service my-app`