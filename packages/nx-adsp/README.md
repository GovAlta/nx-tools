# About this project
This is the Government of Alberta - DIO - Nx plugin for ADSP apps.

The plugin includes generators for application, service, and fullstack solution quick starts. If the peer dependency `@abgov/nx-oc` is found, then OpenShift yml files are also included in the quickstarts.

## TLDR

1. Create your Nx workspace using `npx create-nx-workspace my-workspace`
2. Install plugin: `npm i -D @abgov/nx-adsp`
3. Generate a quick start `npx g @abgov/nx-adsp:express-service my-app`


# Dev Features

Stuff inside [] needs to be replaced with your own names

## To add a plugin to @abgov/nx-adsp

nx g @nrwl/nx-plugin:plugin [pluginName] --importPath .
move the code generated into packages/ns-adsp and make changes in the plugin directory you've just generated

## To test the plugin locally

1. Generate a temp folder with a local nx-adsp using `nx run nx-adsp-e2e:e2e`
2. Generate a new project somewhere with `npx create-nx-workspace`, following the prompts
3. add the following to the dev dependencies in package.json inside the new workspace (this assumes you an angular plugin)

    "@abgov/nx-adsp": "[location-of-nx-tools]/dist/packages/nx-adsp",
    "@nrwl/angular": "^12.0.8",

4. run npm install
5. generate the plugin using `npx nx g @abgov/nx-adsp:[pluginName] my-ang-app --tenant tenantName`
6. run npm install
7. serve the plugin using `nx serve [pluginName]
