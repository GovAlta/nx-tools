# @abgov/nx-adsp

Nx plugin for bootstrapping [ADSP](https://govalta.github.io/adsp-monorepo/) applications for the Government of Alberta.

The plugin provides generators for Node/Express services, React and Angular frontends, .NET services, and fullstack solutions. When `@abgov/nx-oc` is also installed in the workspace, OpenShift deployment YAML is automatically included in the generated output.

## Prerequisites

Install only the framework peers for the generators you use — they are declared
as **optional** peer dependencies, so a workspace that only builds Vue apps
doesn't need `@nx/react`, `@nx/angular`, etc.

| Generator | Required peer dependency |
|-----------|--------------------------|
| `react-app` | `@nx/react` |
| `angular-app` | `@nx/angular` |
| `vue-app` | `@nx/vue` |
| `dotnet-service` | `@nx-dotnet/core` |
| `react-dotnet` | `@nx/react`, `@nx-dotnet/core` |
| `express-service` | `@nx/express` |
| `pevn`, `mevn` (full-stack) | `@nx/express`, `@nx/vue` |
| `pern`, `pean` (full-stack) | `@nx/express`, `@nx/react`/`@nx/angular` |
| `react-form`, `react-task-list` | existing React project in the workspace |

## Installation

```bash
npm i -D @abgov/nx-adsp
```

## Quick Start

```bash
# 1. Create a workspace
npx create-nx-workspace my-workspace

# 2. Install the plugin and any required peer dependencies
npm i -D @abgov/nx-adsp @nx/express

# 3. Generate a quickstart (interactive prompts fill missing options)
npx nx g @abgov/nx-adsp:express-service my-service --env dev --tenant my-tenant
```

## Full-stack quickstart (PEVN → sandbox)

This is the end-to-end path a coding agent can follow from an empty folder to a
running full-stack app in an OpenShift sandbox. The plugins require **Nx 23**,
which `create-nx-workspace@latest` produces by default.

Prerequisites for the sandbox deploy (steps 4–5): `podman` (machine started on
macOS), `oc` logged in to the sandbox cluster, and the GitHub CLI (`gh`)
authenticated as an account with **`write:packages`** on your registry org.

> **Coding agents:** run generators with `--no-interactive` **and** every required
> option (name, `--env`, `--sandboxProject`, etc.) supplied — otherwise Nx prompts
> and your session hangs waiting for input. Setting `CI=true` in the env has the
> same effect and also skips the Nx Cloud prompt. (`nx run <target>` executors
> don't prompt — this only applies to `nx g` generators.) The commands below
> already follow this.

```bash
# 1. Empty folder → Nx workspace (the plugins require Nx 23)
npx create-nx-workspace@latest my-solution --preset=apps --workspaceType=integrated --nxCloud=skip --no-interactive
cd my-solution

# 2. Install the plugins + stack peers (match @nx/* to the workspace nx version)
NXV=$(node -p "require('./node_modules/nx/package.json').version")
npm i -D @abgov/nx-oc @abgov/nx-adsp "@nx/express@$NXV" "@nx/vue@$NXV" "@nx/node@$NXV" "@nx/js@$NXV" "@nx/eslint@$NXV"

# 3. Sign in to ADSP once (opens a browser; token is cached for later generator runs)
npx @abgov/adsp-cli login --env test --tenant "<Your Tenant>" --scope adsp-cli-admin

# 4. Scaffold a Postgres + Express + Vue + Node solution
npx nx g @abgov/nx-adsp:pevn acme --env=dev --tenant=my-tenant --no-interactive

# 5. Add sandbox targets (registry derives from the git remote, or pass --registry=ghcr.io/<org>;
#    the database is auto-detected from the service — no --database needed)
npx nx g @abgov/nx-oc:sandbox acme-service --sandboxProject=<namespace> --registry=ghcr.io/<org> --tenant=my-tenant --env=dev --no-interactive
npx nx g @abgov/nx-oc:sandbox acme-app --sandboxProject=<namespace> --tenant=my-tenant --env=dev --no-interactive

# 6. Deploy — backend first so the frontend's /api proxy resolves
npx nx run acme-service:sandbox
npx nx run acme-app:sandbox            # or: --deployBackend to bring the backend up in the same run
```

Each generated app has an `AGENTS.md` (framework + ADSP context) and, once
step 5 runs, a `.openshift/<app>/SANDBOX.md` deploy/troubleshooting runbook.
See [`@abgov/nx-oc`](https://www.npmjs.com/package/@abgov/nx-oc) for the sandbox
deploy details.

## Generators

### `express-service`

Creates a Node/Express backend service configured for ADSP.

```bash
npx nx g @abgov/nx-adsp:express-service my-service --env dev --tenant my-tenant
```

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `name` | — | Yes | Name of the service |
| `env` | `-e` | No | ADSP environment / access service. Defaults to `test` = access-uat.alberta.ca (UAT — use for dev and pre-prod); `prod` = access.alberta.ca; `dev` = ADSP platform dev (restricted) |
| `tenant` | `-t` | No | ADSP tenant name; resolves the Keycloak realm by name (sign in once with `@abgov/adsp-cli` — see Authentication) |
| `tenantRealm` | `-tr` | No | Keycloak realm UUID; overrides the realm resolved from `--tenant` |
| `accessToken` | `-at` | No | Access token for non-interactive retrieval of ADSP configuration |

---

### `react-app`

Creates a React/Redux frontend application configured for ADSP. Requires `@nx/react`.

```bash
npx nx g @abgov/nx-adsp:react-app my-app --env dev --tenant my-tenant
```

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `name` | — | Yes | Name of the application |
| `env` | `-e` | No | ADSP environment / access service. Defaults to `test` = access-uat.alberta.ca (UAT — use for dev and pre-prod); `prod` = access.alberta.ca; `dev` = ADSP platform dev (restricted) |
| `tenant` | `-t` | No | ADSP tenant name; resolves the Keycloak realm by name (sign in once with `@abgov/adsp-cli` — see Authentication) |
| `tenantRealm` | `-tr` | No | Keycloak realm UUID; overrides the realm resolved from `--tenant` |
| `accessToken` | `-at` | No | Access token for non-interactive retrieval of ADSP configuration |
| `proxy` | — | No | Nginx proxy rule(s) as `{ location, proxyPass }` or an array of such objects |

---

### `angular-app`

Creates an Angular frontend application configured for ADSP. Requires `@nx/angular`.

```bash
npx nx g @abgov/nx-adsp:angular-app my-app --env dev --tenant my-tenant
```

Accepts the same options as `react-app`.

---

### `dotnet-service`

Creates an ASP.NET Core backend service configured for ADSP. Requires `@nx-dotnet/core`.

```bash
npx nx g @abgov/nx-adsp:dotnet-service my-service --env dev --accessToken $TOKEN
```

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `name` | — | Yes | Name of the service |
| `env` | `-e` | No | ADSP environment / access service. Defaults to `test` = access-uat.alberta.ca (UAT — use for dev and pre-prod); `prod` = access.alberta.ca; `dev` = ADSP platform dev (restricted) |
| `accessToken` | `-at` | No | Access token for non-interactive retrieval of ADSP configuration |

---

### `react-dotnet`

Composite generator that creates both a React frontend and a .NET backend as a fullstack solution. Requires `@nx/react` and `@nx-dotnet/core`.

```bash
npx nx g @abgov/nx-adsp:react-dotnet my-solution --env dev
```

Accepts the same options as `dotnet-service`.

---

### `react-form`

Adds a React component generated from an existing [ADSP Form Definition](https://govalta.github.io/adsp-monorepo/) to an existing project. The generator fetches form definitions from the ADSP Form service for the target environment.

```bash
npx nx g @abgov/nx-adsp:react-form my-app --env test
```

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `project` | — | Yes | Name of the existing Nx project to add the form component to |
| `env` | `-e` | No | ADSP environment to fetch form definitions from. Defaults to `test` (UAT / access-uat.alberta.ca) |
| `accessToken` | `-at` | No | Access token for non-interactive retrieval of ADSP configuration |

---

### `react-task-list`

Adds a React task list component driven by an [ADSP Task Queue](https://govalta.github.io/adsp-monorepo/) to an existing project.

```bash
npx nx g @abgov/nx-adsp:react-task-list my-app --env test
```

Accepts the same options as `react-form`.

---

## Authentication

Most generators call ADSP APIs during generation, which needs an ADSP access
token. Sign-in is delegated to **[`@abgov/adsp-cli`](https://www.npmjs.com/package/@abgov/adsp-cli)** —
log in once (interactive browser) and its cached token is reused across generator
runs. There's no separate login built into this plugin.

```bash
# Sign in once. --scope adsp-cli-admin grants the Keycloak-admin capability some
# generators use to provision a service's OAuth client (safe to request without it).
npx @abgov/adsp-cli login --env <dev|test|prod> --tenant "<Your Tenant>" --scope adsp-cli-admin
```

When you run a generator:

- if a valid cached token exists, generation proceeds with no prompt;
- if not, an **interactive** run launches `adsp login` for you (browser); a
  **non-interactive** run (`--no-interactive` / CI) fails with the exact
  `adsp login` command to run first.

Generator flags that steer which tenant/token is used:

| Flag | Effect |
|------|--------|
| `--tenant <name>` | Resolves the Keycloak realm by tenant name (anonymous lookup) and targets it |
| `--tenantRealm <uuid>` | Use the realm UUID directly; combine with `--tenant` to override the resolved realm |
| `--accessToken <token>` | Supply a pre-obtained token directly (CI/CD), bypassing the CLI |

With none of these, the generator lets `adsp login`'s interactive picker resolve the tenant.

## nx-oc integration

If `@abgov/nx-oc` is installed in the workspace, the quickstart generators (`express-service`, `react-app`, `angular-app`, `dotnet-service`, `react-dotnet`) automatically include OpenShift deployment YAML in their output. See the [@abgov/nx-oc README](../nx-oc/README.md) for details.

## Local development

To test the plugin locally against a workspace:

```bash
# 1. Build the plugin
nx run nx-adsp:build

# 2. In a separate test workspace, install from the build output
npm i -D /path/to/nx-tools/dist/packages/nx-adsp

# 3. Run a generator
npx nx g @abgov/nx-adsp:express-service my-service --tenant my-tenant-realm-uuid
```

To add a new generator to this plugin:

```bash
nx g @nx/plugin:generator [generatorName] --project nx-adsp
```
