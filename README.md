# About the project
This is a monorepo of the Government of Alberta's custom plugins for [Nx](https://nx.dev)

## Plugins

[Nx OpenShift Plugin](./packages/nx-oc/README.md) - includes generators for setting up OpenShift pipeline and application yaml files, and executors for `oc cli` commands.

[Nx Dotnet Plugin](./packages/nx-dotnet/README.md) - **Deprecated** - Use [nx-dotnet/core](https://github.com/nx-dotnet/nx-dotnet) for dotnet generators and executors.

[Nx Release Plugin](./packages/nx-release/README.md) - includes generators for adding [semantic-release](https://github.com/semantic-release/semantic-release) based release targets.

[Nx ADSP Plugin](./packages/nx-adsp/README.md) - includes generators for application, service, and fullstack solution quick starts.

## Quick start
1. Create workspace and install plugins.
    ```bash
    npx create-nx-workspace my-project --preset empty --nx-cloud false

    cd my-project

    # Install @abgov plugins.
    npm i -D @abgov/nx-oc @abgov/nx-adsp

    # Install peer dependencies depending on desired frameworks.
    npm i -D @nrwl/angular @nx-dotnet/core
    ```

2. Generate `oc` pipeline manifests and resources. *Apply the pipeline to OpenShift* requires `oc` cli to be installed and already logged in.

    ```bash
    npx nx g @abgov/nx-oc:pipeline
    ? What should be the name of the oc pipeline? my-project-ci
    ? What project should be used for build infrastructure? my-project-build
    ? Generate a Jenkins (jenkins) based pipeline or a GitHub Actions (actions) pipeline? actions
    ? What projects should be used for environments (dev test staging prod)? my-project-dev my-project-test ...
    ? Apply the pipeline to OpenShift? No
    ```

3. List the available application generators.
    ```bash
    npx nx list @abgov/nx-adsp
    ```
4. Generate an application.
    ```bash
    npx nx g @abgov/nx-adsp:angular-app my-angular-app
    ```
5. Generate a backend service.
   ```bash
   npx nx g @abgov/nx-adsp:dotnet-service my-dotnet-service
   ```
