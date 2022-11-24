# About this project
This is the Government of Alberta - Nx plugin for ADSP apps.

The plugin includes generators for application, service, and fullstack solution quick starts. If the peer dependency `@abgov/nx-oc` is found, then OpenShift yml files are also included in the quickstarts. Application stack peer dependencies are required for the associated ADSP application type; for example, `@nrwl/angular` is required for the angular-app, and [@nx-dotnet/core](https://github.com/nx-dotnet/nx-dotnet) is required for dotnet-service.

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

3. Inside the new workspace, 
  i) run
    npm i -D [location-of-nx-tools]/dist/packages/nx-adsp  //to update package.json
    npm i -D @nrwl/angular   //(this assumes you are building an angular plugin)

  ii) generate the plugin - tenantRealm is the realm UUID used to generate a login feature that will log into that particular tenant (eg '2a9a2c30-a094-4097-9247-8d41b39cb80e')
     `npx nx g @abgov/nx-adsp:[pluginName] my-ang-app --tenant tenantRealm`
  iii) run `npm install`
  iv) serve the plugin using `nx serve [pluginName]
