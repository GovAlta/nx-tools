---
layout: page
title: Getting started
nav_order: 1
---

<details open markdown="block">
  <summary>
    Table of contents
  </summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

# Getting started
Government of Alberta's Nx Tools are a set of plugins for [nx](https://nx.dev) including plugins for working in OpenShift, generating new applications, and automating releases of published libraries.

## Version compatibility

@abgov libraries at version *x* correspond to @nrwl workspace at version *x + 10*

* @abgov/nx-oc@1 -> @nrwl/cli@11
* @abgov/nx-oc@2 -> @nrwl/cli@12
* @abgov/nx-oc@5 -> @nrwl/cli@15

When installing @nrwl dependencies, make sure versions across all @nrwl scope dependencies are the same.

## Quick start
The follow steps can be used to generate a basic React frontend, Express/Node backend solution deployed on OpenShift with a GitHub Actions based continuous delivery pipeline.

### Prerequisite
- Empty Github repository
- OpenShift Projects to use for build, dev, test, and prod
- [ADSP](https://adsp.alberta.ca) Tenant

### Steps

1. Create an NX workspace.
   
   ```
   npx create-nx-workspace@15.9.3 my-project --preset empty --nx-cloud false   
   ```

2. Push the project to GitHub repository.
   
   ```
   cd my-project
   git remote add origin <REMOTE_URL>
   git push -u origin main
   ```

3. Install dependencies needed for the React and Express based solution.
   
    ```
    npm i -D @nrwl/react@15.9.3 @nrwl/express@15.9.3 @abgov/nx-oc@5 @abgov/nx-adsp@5
    ```

    @abgov/nx-adsp includes peer dependencies for its application templates. Make sure that the appropriate ones are installed. (e.g. @nrwl/angular if generating Angular application.)

4. Generate a GitHub pipeline for the project.
   
    ```
    oc login <URL> --token=<TOKEN>

    npx nx g @abgov/nx-oc:pipeline
    ? What should be the name of the oc pipeline? my-project-ci
    ? What project should be used for build infrastructure? my-project-build
    ? Generate a Jenkins (jenkins) based pipeline or a GitHub Actions (actions) pipeline? actions
    ? What projects should be used for environments (dev test prod)? my-project-dev my-project-uat my-project-prod
    ? Apply the pipeline to OpenShift? Yes
    ```

    This will add add yaml files for the GitHub workflow and the pipeline OpenShift resources. When you answer yes to 'Apply the pipeline to OpenShift?', the generator will also create the openshift resources specified in the manifest files.

    ```
    .github/
      └─ pipeline.yml
    .openshift/
      ├─ environment.infra.yml
      └─ environments.yml    
    ```

5. Generate the React frontend and Express backend projects.
   
    ```
    npx nx g @abgov/nx-adsp:mern demo
    ? Which ADSP environment do you want to target? <Tenant>
    ```

    This will generate additional projects as well as associated OpenShift manifests in the workspace.

    ```
    .openshift/
      ├─ demo-app
      └─ demo-service
    apps
      ├─ demo-app
      └─ demo-service    
    ```

    Note that the OpenShift manifests are only generated if a pipeline has already been generated for the workspace. In order to add manifests to an existing project in the monorepo, refer to the `@abgov/nx-oc:deployment` generator.

6. Run apply-envs target to create the OpenShift resources across dev, test and prod environments.

    ```
    npx nx run demo-app:apply-envs
    ```

7. Commit and push the updated working copy to GitHub.
