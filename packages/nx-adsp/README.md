# @abgov/nx-adsp

Nx plugin for bootstrapping [ADSP](https://govalta.github.io/adsp-monorepo/) applications for the Government of Alberta.

The plugin provides generators for Node/Express services, React, Angular, and Vue 3 frontends, .NET services, and fullstack solutions. When `@abgov/nx-oc` is also installed in the workspace, OpenShift deployment YAML is automatically included in the generated output.

## Prerequisites

Install only the framework peers for the generators you use — they are declared
as **optional** peer dependencies, so a workspace that only builds Vue apps
doesn't need `@nx/react`, `@nx/angular`, etc.

| Generator                                                                    | Required peer dependency                    |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| `react-app`                                                                  | `@nx/react`                                 |
| `angular-app`                                                                | `@nx/angular`                               |
| `vue-app`                                                                    | `@nx/vue`                                   |
| `dotnet-service`                                                             | `@nx-dotnet/core`                           |
| `react-dotnet`                                                               | `@nx/react`, `@nx-dotnet/core`              |
| `express-service`                                                            | `@nx/express`                               |
| `pevn`, `mevn` (full-stack)                                                  | `@nx/express`, `@nx/vue`                    |
| `pern`, `pean` (full-stack)                                                  | `@nx/express`, `@nx/react`/`@nx/angular`    |
| `react-form`, `react-task-list`                                              | existing React project in the workspace     |
| `vue-detail-view`, `vue-workspace-view`, `vue-admin-crud`, `vue-intake-view` | existing `vue-app` project in the workspace |

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

# 3. Set up nx-adsp's own workspace-root concerns (ADSP SDK MCP server, VS Code
#    settings) — always run this right after installing the plugin. Every
#    app/service generator below also runs it as one of its own steps, but
#    running it here means grounded ADSP platform knowledge is available
#    immediately, not only once you've scaffolded your first app.
npx nx g @abgov/nx-adsp:init

# 4. Generate a quickstart (interactive prompts fill missing options)
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
> don't prompt — this only applies to `nx g` generators.) Also pass `--skipAgent`
> — see [Agent consultation](#agent-consultation) for why you want to, not just
> how. The commands below already follow this.

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
npx nx g @abgov/nx-adsp:pevn acme --env=dev --tenant=my-tenant --no-interactive --skipAgent

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

### `init`

Sets up nx-adsp's own workspace-root concerns: registers the ADSP SDK MCP server
(`@abgov/adsp-sdk-mcp-server`) in `.mcp.json`, and shared VS Code settings. Every app/service
generator below already runs this as one of its own steps — always run it directly right after
installing the plugin, too, so grounded ADSP platform knowledge (tenant/realm/role model,
`@abgov/adsp-service-sdk` reference) is available immediately, not only once you've scaffolded
your first app. That gap matters for a decision made _before_ any app exists — a design pass, for
instance — which a scaffolding-generator side effect can never reach in time.

```bash
npx nx g @abgov/nx-adsp:init
```

No options. Idempotent — merges into existing `.mcp.json`/`.vscode/settings.json` without
clobbering another server, a customized `adsp-sdk` entry, or unrelated settings; safe to re-run.
Project-scoped MCP servers only load at session start, so reconnect (or restart) your MCP client
after running this before relying on the new tools — the generator's own output says so as a
reminder.

---

### `express-service`

Creates a Node/Express backend service configured for ADSP.

```bash
npx nx g @abgov/nx-adsp:express-service my-service --env dev --tenant my-tenant
```

| Option        | Alias | Required | Description                                                                                                                                                                        |
| ------------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | —     | Yes      | Name of the service                                                                                                                                                                |
| `env`         | `-e`  | No       | ADSP environment / access service. Defaults to `test` = access-uat.alberta.ca (UAT — use for dev and pre-prod); `prod` = access.alberta.ca; `dev` = ADSP platform dev (restricted) |
| `tenant`      | `-t`  | No       | ADSP tenant name; resolves the Keycloak realm by name (sign in once with `@abgov/adsp-cli` — see Authentication)                                                                   |
| `tenantRealm` | `-tr` | No       | Keycloak realm UUID; overrides the realm resolved from `--tenant`                                                                                                                  |
| `accessToken` | `-at` | No       | Access token for non-interactive retrieval of ADSP configuration                                                                                                                   |

OpenAPI docs are generated from the same Zod schemas already used for request validation
(`@asteasolutions/zod-to-openapi`) and served at `/swagger/docs/v1` — no separate spec to
hand-maintain. The root `/` endpoint's `_links.docs` points at it, which is what ADSP's directory
service polls to aggregate the service's API docs into `https://api.adsp.alberta.ca/{tenant}` (once
the service has a directory entry — a one-time setup step outside this generator).

---

### `react-app`

Creates a React/Redux frontend application configured for ADSP. Requires `@nx/react`.

```bash
npx nx g @abgov/nx-adsp:react-app my-app --env dev --tenant my-tenant
```

| Option          | Alias | Required | Description                                                                                                                                                                        |
| --------------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | —     | Yes      | Name of the application                                                                                                                                                            |
| `env`           | `-e`  | No       | ADSP environment / access service. Defaults to `test` = access-uat.alberta.ca (UAT — use for dev and pre-prod); `prod` = access.alberta.ca; `dev` = ADSP platform dev (restricted) |
| `tenant`        | `-t`  | No       | ADSP tenant name; resolves the Keycloak realm by name (sign in once with `@abgov/adsp-cli` — see Authentication)                                                                   |
| `tenantRealm`   | `-tr` | No       | Keycloak realm UUID; overrides the realm resolved from `--tenant`                                                                                                                  |
| `accessToken`   | `-at` | No       | Access token for non-interactive retrieval of ADSP configuration                                                                                                                   |
| `pairedProject` | —     | No       | Name of an existing backend service project to derive the nginx/dev-server proxy and the `adsp:proxy-service:` sandbox tag from automatically — the project must already exist     |
| `proxy`         | —     | No       | Nginx proxy rule(s) as `{ location, proxyPass }` or an array of such objects — additional entries `--pairedProject` doesn't cover; can't duplicate its location                    |

Running this generator standalone against a backend that's already scaffolded? Pass
`--pairedProject <backend-project-name>` instead of hand-computing `--proxy` — it derives the same
`http://<name>:3333/<name>/` convention `pevn`/`pern`/`pean`/`mevn` already use internally, plus the
tag `@abgov/nx-oc:sandbox` needs to pre-create the backend's Service.

The generated Playwright e2e project includes an axe-core accessibility check (`a11y.spec.ts`),
scoped to WCAG 2.1 A/AA, that runs automatically as part of the `e2e` target — no separate command
needed. `angular-app` and `vue-app` include the same check.

---

### `angular-app`

Creates an Angular frontend application configured for ADSP. Requires `@nx/angular`.

```bash
npx nx g @abgov/nx-adsp:angular-app my-app --env dev --tenant my-tenant
```

Accepts the same options as `react-app`.

---

### `vue-app`

Creates a Vue 3 frontend application configured for ADSP, using GoA web components
(`@abgov/web-components`) and `@dsb-norge/vue-keycloak-js` for authentication. Requires
`@nx/vue`.

```bash
npx nx g @abgov/nx-adsp:vue-app my-app --env dev --tenant my-tenant
```

Accepts the same options as `react-app`, plus:

| Option   | Required | Description                                                                                                                                                                                                                                                                                            |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `layout` | No       | Top-level app shell: `header` (default) is a `goa-app-header` + hero banner + footer (public-facing); `internal` is a `goa-work-side-menu` shell with no header/banner/footer (staff-facing). Pair two runs against the same `--pairedProject` for a public+internal frontend pairing over one backend |

Every generated app provisions a shared `vue-components` library — `Goab*` `v-model` wrappers
over the design system plus reusable app-shell pattern components (`AppLayout`, `AppHeader`,
`AppFooter`, `AppSideMenu`, `SessionExpiredBanner`) — see the generated app's own `AGENTS.md`
for the full contract. Four more generators retrofit common view shapes into an existing
`vue-app` project; see below.

---

### `dotnet-service`

Creates an ASP.NET Core backend service configured for ADSP. Requires `@nx-dotnet/core`.

```bash
npx nx g @abgov/nx-adsp:dotnet-service my-service --env dev --accessToken $TOKEN
```

| Option        | Alias | Required | Description                                                                                                                                                                        |
| ------------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | —     | Yes      | Name of the service                                                                                                                                                                |
| `env`         | `-e`  | No       | ADSP environment / access service. Defaults to `test` = access-uat.alberta.ca (UAT — use for dev and pre-prod); `prod` = access.alberta.ca; `dev` = ADSP platform dev (restricted) |
| `accessToken` | `-at` | No       | Access token for non-interactive retrieval of ADSP configuration                                                                                                                   |

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

| Option        | Alias | Required | Description                                                                                       |
| ------------- | ----- | -------- | ------------------------------------------------------------------------------------------------- |
| `project`     | —     | Yes      | Name of the existing Nx project to add the form component to                                      |
| `env`         | `-e`  | No       | ADSP environment to fetch form definitions from. Defaults to `test` (UAT / access-uat.alberta.ca) |
| `accessToken` | `-at` | No       | Access token for non-interactive retrieval of ADSP configuration                                  |

---

### `react-task-list`

Adds a React task list component driven by an [ADSP Task Queue](https://govalta.github.io/adsp-monorepo/) to an existing project.

```bash
npx nx g @abgov/nx-adsp:react-task-list my-app --env test
```

Accepts the same options as `react-form`.

---

### `vue-detail-view`

Adds a record-detail view (loading/error/loaded states, optional status badge, back button) to
an existing `vue-app` project, built on the shared `RecordDetailShell` pattern component.

```bash
npx nx g @abgov/nx-adsp:vue-detail-view my-app --name=application-detail --resource=applications --route=/applications/:id --fields='[{"key":"status","label":"Status","type":"badge"}]'
```

| Option         | Required | Description                                                                                                                                                                                               |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project`      | Yes      | The `vue-app` project to add the view to                                                                                                                                                                  |
| `name`         | Yes      | View name, e.g. `application-detail` generates `src/views/ApplicationDetailView.vue`                                                                                                                      |
| `resource`     | Yes      | API resource path segment — the view fetches `/api/v1/<resource>/:id`                                                                                                                                     |
| `route`        | Yes      | Route path added to `router/index.ts`, e.g. `/applications/:id`. Must contain a `:id` param                                                                                                               |
| `fields`       | Yes      | JSON array of fields rendered in the record's info list, in display order: `{ key, label, type?: "text"\|"date"\|"currency"\|"badge" }` — a JSON string, not a comma-separated CLI array (see note below) |
| `heading`      | No       | Page heading. Defaults to the view name, title-cased                                                                                                                                                      |
| `requiresAuth` | No       | Whether the generated route requires authentication. Defaults to `true`                                                                                                                                   |

---

### `vue-workspace-view`

Adds a staff-facing, paginated list view (a debounced search filter bar + sortable columns) to
an existing `vue-app` project, built on the shared `WorkspaceTable` pattern component.

```bash
npx nx g @abgov/nx-adsp:vue-workspace-view my-app --name=applications --resource=applications --route=/applications --detailRoute=/applications --columns='[{"key":"status","label":"Status","type":"badge","sortable":true}]'
```

| Option         | Required | Description                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project`      | Yes      | The `vue-app` project to add the view to                                                                                                                                                                                                                                                                                                                              |
| `name`         | Yes      | View name, e.g. `applications` generates `src/views/ApplicationsListView.vue`                                                                                                                                                                                                                                                                                         |
| `resource`     | Yes      | API resource path segment — fetches `/api/v1/<resource>?page=&limit=&search=&sortBy=&sortDir=`                                                                                                                                                                                                                                                                        |
| `route`        | Yes      | Route path added to `router/index.ts`, e.g. `/applications`                                                                                                                                                                                                                                                                                                           |
| `columns`      | Yes      | JSON array of table columns, in display order: `{ key, label, type?: "text"\|"date"\|"currency"\|"badge", sortable?, options?: [{value,label}], badgeMap?: {value: badgeType} }` — supply `options` for any column stored as a code (or the table shows the code), and `badgeMap` on a `badge` column to give each status its colour — a JSON string (see note below) |
| `detailRoute`  | No       | If set, each row gets a "View" action linking to `` `${detailRoute}/${row.id}` `` — typically a `vue-detail-view`'s route with the `:id` segment dropped                                                                                                                                                                                                              |
| `filterable`   | No       | Whether to generate a debounced search input above the table. Defaults to `true`                                                                                                                                                                                                                                                                                      |
| `heading`      | No       | Page heading. Defaults to the view name, title-cased                                                                                                                                                                                                                                                                                                                  |
| `pageSize`     | No       | Rows per page. Defaults to `20`                                                                                                                                                                                                                                                                                                                                       |
| `icon`         | No       | Ionicon name for the generated side-menu entry. Defaults to `list`. `goa-work-side-menu-item` renders a blank item without one                                                                                                                                                                                                                                        |
| `requiresAuth` | No       | Whether the generated route requires authentication. Defaults to `true`                                                                                                                                                                                                                                                                                               |

---

### `vue-admin-crud`

Adds a simple admin CRUD screen pair (a `WorkspaceTable` list view with a Create action and
per-row Edit, plus a create/update Edit view) to an existing `vue-app` project — suited to small
lookup-table style admin screens, not large paginated workspaces (see `vue-workspace-view` for
that).

```bash
npx nx g @abgov/nx-adsp:vue-admin-crud my-app --name=regions --resource=regions --route=/regions --fields='[{"key":"name","label":"Name"},{"key":"active","label":"Active","type":"checkbox"}]'
```

| Option          | Required | Description                                                                                                                                                                     |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project`       | Yes      | The `vue-app` project to add the views to                                                                                                                                       |
| `name`          | Yes      | View name, e.g. `regions` generates `src/views/RegionsListView.vue` and `src/views/RegionsEditView.vue`                                                                         |
| `resource`      | Yes      | API resource path segment — fetches `/api/v1/<resource>` (list), `/api/v1/<resource>/:id` (load one), `POST /api/v1/<resource>` (create), `PUT /api/v1/<resource>/:id` (update) |
| `route`         | Yes      | List route path added to `router/index.ts`, e.g. `/regions`. The edit/create route is added as `` `${route}/:id` `` (visiting `${route}/new` creates)                           |
| `fields`        | Yes      | JSON array of fields, in display/form order: `{ key, label, type?: "text"\|"checkbox", required? }` — a JSON string (see note below)                                            |
| `heading`       | No       | List page heading. Defaults to the view name, title-cased                                                                                                                       |
| `singularLabel` | No       | Singular label used in "Create <label>"/"Edit <label>" headings and buttons. Defaults to `--heading` (override for irregular plurals)                                           |
| `icon`          | No       | Ionicon name for the generated side-menu entry. Defaults to `settings`. `goa-work-side-menu-item` renders a blank item without one                                              |
| `requiresAuth`  | No       | Whether the generated routes require authentication. Defaults to `true`                                                                                                         |

---

### `vue-intake-view`

Adds a route-per-step intake wizard (`Stepper` + `StepErrorSummary`, a required read-only
review step, and a confirmation page) to an existing `vue-app` project. Cross-step state is
server-persisted — each step PUTs/POSTs to `/api/v1/<resource>/:id` and refetches on mount, so
there's no client-side draft caching. Every field is currently a plain text input.

```bash
npx nx g @abgov/nx-adsp:vue-intake-view my-app --name=application --resource=applications --route=/applications --steps='[{"key":"personal-info","label":"Personal information","fields":[{"key":"fullName","label":"Full name"}]}]'
```

| Option           | Required | Description                                                                                                                                                                   |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project`        | Yes      | The `vue-app` project to add the views to                                                                                                                                     |
| `name`           | Yes      | Base name for the generated views, e.g. `application` generates `<Step>StepView.vue` per step plus `ApplicationReviewView.vue`/`ApplicationConfirmationView.vue`              |
| `resource`       | Yes      | API resource path segment. Each step fetches/saves `/api/v1/<resource>/:id`; the review step's Submit posts `/api/v1/<resource>/:id/submit`                                   |
| `route`          | Yes      | Base route, e.g. `/applications`. Steps become `/applications/:id/<step-key>`, plus `/review` and `/confirmation`. Start a new intake at `/applications/new/<first-step-key>` |
| `steps`          | Yes      | JSON array of steps, in order: `{ key, label, fields: [{ key, label, required? }] }` — a JSON string (see note below)                                                         |
| `referenceField` | No       | Field on the submitted record holding the business reference shown on the confirmation page. Defaults to `reference`; falls back to the route id when absent                  |
| `requiresAuth`   | No       | Whether the generated routes require authentication. Defaults to `true`                                                                                                       |

---

> **Note on JSON-string options (`fields`/`columns`/`steps`):** Nx's own CLI arg coercion only
> supports comma-separated primitive lists for `array`-typed schema options, not JSON — a JSON
> string is the only CLI syntax that survives it, so these options are declared as `string` and
> parsed internally. A plain array also works when the generator is invoked programmatically
> (e.g. from a script), bypassing CLI parsing entirely.

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
- if `ADSP_CLIENT_ID`/`ADSP_CLIENT_SECRET` are set (a CI service account — requires
  `@abgov/adsp-cli` ^1.7.0+ and the tenant's `adsp-cli-ci` Keycloak client enabled with credentials
  generated), a fresh token is acquired non-interactively via that account, no browser and no prior
  `adsp login` needed;
- otherwise, an **interactive** run launches `adsp login` for you (browser); a **non-interactive**
  run (`--no-interactive` / CI) fails with the exact `adsp login` command to run first, or the two
  env vars above to set instead.

Generator flags that steer which tenant/token is used:

| Flag                    | Effect                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `--tenant <name>`       | Resolves the Keycloak realm by tenant name (anonymous lookup) and targets it        |
| `--tenantRealm <uuid>`  | Use the realm UUID directly; combine with `--tenant` to override the resolved realm |
| `--accessToken <token>` | Supply a pre-obtained token directly (CI/CD), bypassing the CLI                     |

With none of these, the generator lets `adsp login`'s interactive picker resolve the tenant. Don't
have a tenant yet? That picker also offers a **+ Create a new tenant** choice — available in
`dev`/`test` (never `prod`), for an account whose core-realm roles include `beta-tester` or
`tenant-service-admin`, and (unless `tenant-service-admin`) that doesn't already own a tenant (one
per admin email). Picking it prompts for a name and waits for the new realm to finish provisioning
before continuing the login as that tenant. Requires `@abgov/adsp-cli` ^1.4.0+ (this plugin pins
^1.7.0 or later).

## Agent consultation

`express-service`, `react-app`, `angular-app`, `vue-app`, and the fullstack composites connect to
ADSP's own `agent-service` after base scaffolding and hold an interactive, multi-turn conversation
with an ADSP-aware agent that can read and modify key integration files (`main.ts`,
`environment.ts`, `events.ts`, `database.ts`) based on a description you provide. The socket
connection and file upload start immediately, in parallel with prompting for that description.

This needs the same tenant/token as [Authentication](#authentication) above, plus a reachable
`agent-service` — it falls back silently to base scaffolding if either is missing, or if the run
is non-interactive (`--no-interactive`, no TTY, or `CI=true`). Skip it explicitly with
`--skipAgent`, regardless of interactivity.

> **Note for coding agents:** skip this. It exists to let a _human_ describe what they want built
> to a separate, remote agent working from nothing but that description. You already have the
> actual requirements and the surrounding codebase context that conversation exists to gather —
> make any needed customizations directly, after scaffolding, rather than through an indirect
> round-trip to a second, less-informed agent. Pass `--skipAgent` explicitly rather than relying
> on `--no-interactive` alone: `--skipAgent` is a plain option check at the generator level, while
> `--no-interactive`'s detection is built on argv inspection this plugin's own code notes could go
> stale on an Nx upgrade — belt and suspenders, not a real behavior difference today.

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
