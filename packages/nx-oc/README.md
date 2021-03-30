# About this project
This is the Government of Alberta - DIO - Nx plugin for OpenShift.

The plugin includes generators for setting up OpenShift pipeline and application yaml files, and executors for `oc cli` commands.

## TLDR

1. Create your Nx workspace using `npx create-nx-workspace my-workspace`
2. Install plugin: `npm i -D @abgov/nx-oc`
3. Login to OpenShift: `oc login {url} --token={token}`
4. Generate basic infrastructure yml and apply it: `npx nx g @abgov/nx-oc:pipline`
5. Set up OpenShift yml on apps using `npx nx g @abgov/nx-oc:deployment`

