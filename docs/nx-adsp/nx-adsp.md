---
layout: page
title: NX ADSP plugin
nav_order: 2
has_children: true
---

<details open markdown="block">
  <summary>
    Table of contents
  </summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

# @abgov/nx-adsp

Nx plugin for bootstrapping [ADSP](https://adsp.alberta.ca) applications for the Government of Alberta.

The plugin provides generators for Node/Express services, React, Angular, and Vue 3 frontends, .NET services, and fullstack solutions (MERN, MEAN, MEVN, PERN, PEAN, PEVN). When `@abgov/nx-oc` is also installed, OpenShift deployment YAML is automatically included in the generated output.

## Installation

```bash
npm i -D @abgov/nx-adsp
```

## Prerequisites

Some generators require additional peer dependencies:

| Generator | Required peer dependency |
|-----------|--------------------------|
| `react-app` | `@nx/react` |
| `angular-app` | `@nx/angular` |
| `vue-app` | `@nx/vue` |
| `dotnet-service` | `@nx-dotnet/core` |
| `react-dotnet` | `@nx/react`, `@nx-dotnet/core` |
| `express-service` | `@nx/node` |
| `mern`, `pern` | `@nx/react`, `@nx/node` |
| `mean`, `pean` | `@nx/angular`, `@nx/node` |
| `mevn`, `pevn` | `@nx/vue`, `@nx/node` |
| `react-form`, `react-task-list` | existing React project in the workspace |

## Generators

### express-service

Creates a Node/Express backend service configured for ADSP.

```bash
npx nx g @abgov/nx-adsp:express-service my-service --env dev --tenant my-tenant
```

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `name` | — | Yes | Name of the service |
| `env` | `-e` | Yes | ADSP environment: `dev`, `test`, or `prod` |
| `tenant` | `-t` | No | ADSP tenant name; looks up the Keycloak realm and opens a single browser login |
| `tenantRealm` | `-tr` | No | Keycloak realm UUID; overrides the realm resolved from `--tenant` |
| `accessToken` | `-at` | No | Access token for non-interactive retrieval of ADSP configuration |
| `database` | — | No | Database to scaffold: `none` (default), `postgres` (Prisma), or `mongo` (Mongoose) |
| `skipAgent` | — | No | Skip the consultAgent interaction and generate base scaffolding only |

When `--database postgres` is selected the generator also scaffolds a `prisma/schema.prisma`, a `PrismaClient` singleton, an idempotent Podman script for a local Postgres container, and Nx targets (`db:generate`, `db:migrate`, `db:migrate:deploy`, `db:studio`, `dev-db`). When `--database mongo` is selected it scaffolds a Mongoose connection helper and an equivalent Podman script for a local MongoDB container. See [Database setup](#database-setup) below.

The generated `src/main.ts` includes `authorize`, `createValidationHandler`, and `createErrorHandler` from `@abgov/adsp-service-sdk`, and an example `POST /v1/example` route that shows the full pattern: role check → input validation (Zod schema) → domain event publish → error forwarding to `createErrorHandler`. Replace or remove the example route once you have real business logic.

```typescript
// Pattern used in the generated example route — adapt for your routes:
app.post(
  '/my-service/v1/resource',
  authorize('my-role'),
  createValidationHandler(MySchema),      // validates req.body; 400 on failure
  async (req, res, next) => {
    try {
      const { id } = req.body as z.infer<typeof MySchema>;
      eventService.send(createMyEvent(id));
      res.json({ id });
    } catch (err) {
      next(err);                          // createErrorHandler maps to 500
    }
  }
);
```

---

### mern

Composite generator that creates both a React frontend and an Express backend as a fullstack solution. The Express service is pre-configured with MongoDB (Mongoose). Requires `@nx/react` and `@nx/node`.

```bash
npx nx g @abgov/nx-adsp:mern my-app --env dev --tenant my-tenant
```

Generates `my-app-service` (Express + Mongoose) and `my-app-app` (React), with a dev proxy and nginx production proxy wired between them.

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `name` | — | Yes | Base name; suffixed with `-service` and `-app` for each project |
| `env` | `-e` | Yes | ADSP environment: `dev`, `test`, or `prod` |
| `tenant` | `-t` | No | ADSP tenant name |
| `tenantRealm` | `-tr` | No | Keycloak realm UUID |
| `accessToken` | `-at` | No | Access token for non-interactive use |
| `skipAgent` | — | No | Skip the consultAgent interaction and generate base scaffolding only |

---

### mean

Composite generator that creates both an Angular frontend and an Express backend as a fullstack solution. The Express service is pre-configured with MongoDB (Mongoose). Requires `@nx/angular` and `@nx/node`.

```bash
npx nx g @abgov/nx-adsp:mean my-app --env dev --tenant my-tenant
```

Generates `my-app-service` (Express + Mongoose) and `my-app-app` (Angular), with a dev proxy and nginx production proxy wired between them.

Accepts the same options as `mern` (including `--skipAgent`).

---

### pern

Composite generator that creates both a React frontend and an Express backend as a fullstack solution. The Express service is pre-configured with PostgreSQL (Prisma). Requires `@nx/react` and `@nx/node`.

```bash
npx nx g @abgov/nx-adsp:pern my-app --env dev --tenant my-tenant
```

Generates `my-app-service` (Express + Prisma) and `my-app-app` (React), with a dev proxy and nginx production proxy wired between them.

Accepts the same options as `mern` (including `--skipAgent`).

---

### pean

Composite generator that creates both an Angular frontend and an Express backend as a fullstack solution. The Express service is pre-configured with PostgreSQL (Prisma). Requires `@nx/angular` and `@nx/node`.

```bash
npx nx g @abgov/nx-adsp:pean my-app --env dev --tenant my-tenant
```

Generates `my-app-service` (Express + Prisma) and `my-app-app` (Angular), with a dev proxy and nginx production proxy wired between them.

Accepts the same options as `mern` (including `--skipAgent`).

---

### pevn

Composite generator that creates both a Vue 3 frontend and an Express backend as a fullstack solution. The Express service is pre-configured with PostgreSQL (Prisma). Requires `@nx/vue` and `@nx/node`.

```bash
npx nx g @abgov/nx-adsp:pevn my-app --env dev --tenant my-tenant
```

Generates `my-app-service` (Express + Prisma) and `my-app-app` (Vue 3), with a dev proxy and nginx production proxy wired between them.

Accepts the same options as `mern` (including `--skipAgent`).

---

### mevn

Composite generator that creates both a Vue 3 frontend and an Express backend as a fullstack solution. The Express service is pre-configured with MongoDB (Mongoose). Requires `@nx/vue` and `@nx/node`.

```bash
npx nx g @abgov/nx-adsp:mevn my-app --env dev --tenant my-tenant
```

Generates `my-app-service` (Express + Mongoose) and `my-app-app` (Vue 3), with a dev proxy and nginx production proxy wired between them.

Accepts the same options as `mern` (including `--skipAgent`).

---

### react-app

Creates a React/Redux frontend application configured for ADSP. Requires `@nx/react`.

```bash
npx nx g @abgov/nx-adsp:react-app my-app --env dev --tenant my-tenant
```

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `name` | — | Yes | Name of the application |
| `env` | `-e` | Yes | ADSP environment: `dev`, `test`, or `prod` |
| `tenant` | `-t` | No | ADSP tenant name; looks up the Keycloak realm and opens a single browser login |
| `tenantRealm` | `-tr` | No | Keycloak realm UUID; overrides the realm resolved from `--tenant` |
| `accessToken` | `-at` | No | Access token for non-interactive retrieval of ADSP configuration |
| `proxy` | — | No | Nginx proxy rule(s): `{ location, proxyPass }` or an array of such objects |

---

### angular-app

Creates an Angular frontend application configured for ADSP. Requires `@nx/angular`.

```bash
npx nx g @abgov/nx-adsp:angular-app my-app --env dev --tenant my-tenant
```

Accepts the same options as `react-app`.

---

### vue-app

Creates a Vue 3 frontend application configured for ADSP, using GoA web components (`@abgov/web-components`) and `@dsb-norge/vue-keycloak-js` for authentication. Requires `@nx/vue`.

```bash
npx nx g @abgov/nx-adsp:vue-app my-app --env dev --tenant my-tenant
```

Accepts the same options as `react-app` (including `--proxy` and `--serviceClientId`).

---

### dotnet-service

Creates an ASP.NET Core backend service configured for ADSP. Requires `@nx-dotnet/core`.

```bash
npx nx g @abgov/nx-adsp:dotnet-service my-service --env dev --accessToken $TOKEN
```

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `name` | — | Yes | Name of the service |
| `env` | `-e` | Yes | ADSP environment: `dev`, `test`, or `prod` |
| `accessToken` | `-at` | No | Access token for non-interactive retrieval of ADSP configuration |

---

### react-dotnet

Composite generator that creates both a React frontend and a .NET backend as a fullstack solution. Requires `@nx/react` and `@nx-dotnet/core`.

```bash
npx nx g @abgov/nx-adsp:react-dotnet my-solution --env dev
```

Accepts the same options as `dotnet-service`.

---

### react-form

Adds a React component generated from an existing [ADSP Form Definition](https://govalta.github.io/adsp-monorepo/) to an existing project. The generator fetches available form definitions from the ADSP Form service for the target environment.

```bash
npx nx g @abgov/nx-adsp:react-form my-app --env test
```

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `project` | — | Yes | Name of the existing Nx project to add the form component to |
| `env` | `-e` | Yes | ADSP environment to fetch form definitions from (typically `test`) |
| `accessToken` | `-at` | No | Access token for non-interactive retrieval of ADSP configuration |

---

### react-task-list

Adds a React task list component driven by an [ADSP Task Queue](https://govalta.github.io/adsp-monorepo/) to an existing project.

```bash
npx nx g @abgov/nx-adsp:react-task-list my-app --env test
```

Accepts the same options as `react-form`.

---

## Database setup

When `--database postgres` or `--database mongo` is passed to `express-service` (or when using the `mern`/`mean` composite generators), the generated project includes a local development database driven by [Podman](https://podman.io/).

### Local development

Start the database container (creates it on first run, starts it on subsequent runs):

```bash
nx dev-db <service-name>
```

The `serve` target declares `dependsOn: ['dev-db']`, so `nx serve <service-name>` starts the container automatically. The connection string is written to `.env.local` in the project directory and picked up by the application without any manual configuration.

**macOS one-time setup** (skip if Podman is already configured):

```bash
podman machine init
podman machine start
```

### PostgreSQL targets

| Target | Description |
|--------|-------------|
| `nx dev-db <service>` | Start local Postgres container (Podman) |
| `nx db:migrate <service>` | Create and apply a new migration (`prisma migrate dev`) |
| `nx db:migrate:deploy <service>` | Apply pending migrations in production/CI (`prisma migrate deploy`) |
| `nx db:generate <service>` | Regenerate the Prisma client after schema changes |
| `nx db:studio <service>` | Open Prisma Studio to browse data |

The `build` target depends on `db:generate`, so the Prisma client is always generated before TypeScript compilation.

### OpenShift deployment

The database connection string is injected via an OpenShift Secret — it is never stored in source control. Create the Secret in each namespace before first deploy:

**PostgreSQL:**
```bash
oc create secret generic <app-name>-database \
  --from-literal=DATABASE_URL=postgresql://user:password@host:5432/dbname \
  -n <namespace>
```

**MongoDB:**
```bash
oc create secret generic <app-name>-database \
  --from-literal=MONGODB_URI=mongodb://user:password@host:27017/dbname \
  -n <namespace>
```

For PostgreSQL services, the deployment manifest includes an init container that runs `prisma migrate deploy` before the application starts, ensuring migrations are applied on every deploy.

---

## Authentication

Most generators call ADSP APIs during generation to retrieve tenant-specific configuration. Three authentication methods are supported:

| Method | When to use |
|--------|-------------|
| `--tenant <name>` | Preferred for interactive use; looks up the Keycloak realm by name and opens a single browser login |
| `--tenantRealm <uuid>` | Use when you already know the realm UUID; can be combined with `--tenant` to override the auto-resolved realm |
| `--accessToken <token>` | Use in CI or scripts to skip interactive login entirely |

If none are provided, the generator will prompt interactively.

## nx-oc integration

If `@abgov/nx-oc` is installed in the workspace, the quickstart generators (`express-service`, `react-app`, `angular-app`, `dotnet-service`, `react-dotnet`) automatically include OpenShift deployment YAML in their output. See the [NX OpenShift plugin](../nx-oc/nx-oc) for details.
