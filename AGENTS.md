# AGENTS.md — nx-tools (Government of Alberta)

This file provides context for AI coding assistants working in this repository.
It is provider-agnostic and self-contained.

---

## Project Overview

`nx-tools` is a monorepo of four custom Nx plugins published to NPM under the `@abgov` scope.
They are used to scaffold and operate applications on the Alberta Digital Service Platform (ADSP)
and to manage OpenShift CI/CD pipelines for Alberta government services.

---

## Repository Structure

```
nx-tools/
├── packages/           # publishable Nx plugin libraries (libsDir)
│   ├── nx-adsp/        # Angular/React/Dotnet app scaffolding for ADSP
│   ├── nx-oc/          # OpenShift pipeline generators + oc CLI executors
│   ├── nx-release/     # semantic-release generator + monorepo commit-filter plugin
│   └── semantic-release-nuget/  # NuGet push plugin for semantic-release
├── e2e/                # Nx app-type projects that run integration tests (appsDir)
│   ├── nx-adsp-e2e/
│   ├── nx-oc-e2e/
│   └── nx-release-e2e/
├── docs/               # GitHub Pages documentation site (Jekyll)
├── tools/              # local workspace utilities
├── .github/workflows/  # CI: pull-request.yml, release-ci.yml, codeql-analysis.yml
├── nx.json             # Nx workspace config (parallel: 1, cached targets)
├── tsconfig.base.json  # path aliases for all packages
└── jest.preset.js      # shared Jest config (legacy snapshot format)
```

---

## Internal Package Aliases

Always import from these aliases — never use relative paths across package boundaries.

| Alias | Resolves to |
|---|---|
| `@abgov/nx-adsp` | `packages/nx-adsp/src/index.ts` |
| `@abgov/nx-oc` | `packages/nx-oc/src/index.ts` |
| `@abgov/nx-release` | `packages/nx-release/src/index.ts` |
| `@abgov/semantic-release-nuget` | `packages/semantic-release-nuget/src/index.ts` |

---

## Generator Anatomy

Every generator lives under `packages/[plugin]/src/generators/[name]/` and follows this structure:

```
schema.json       # JSON Schema for CLI options and interactive prompts (x-prompt)
schema.d.ts       # TypeScript interfaces: Schema (raw) and NormalizedSchema
[name].ts         # default export: async (host: Tree, options: Schema) => ...
[name].spec.ts    # Jest unit tests
files/            # EJS template files; __tmpl__ suffix is stripped at generation time
```

### Template file naming

- Files ending in `__tmpl__` are EJS-processed; the suffix is stripped from the output name.
- Path segments like `__variableName__` are substituted using the `names()` helper.
- Always pass `{ tmpl: '' }` to `generateFiles()` to handle suffix stripping.

### Standard generator body pattern

```typescript
export default async function (host: Tree, options: Schema) {
  const normalizedOptions = normalizeOptions(host, options);
  addFiles(host, normalizedOptions);
  updateProjectConfiguration(host, normalizedOptions.projectName, { ... });
  await formatFiles(host);
  return installPackagesTask(host); // only if new dependencies were added
}
```

New generators must be registered in the package's `generators.json`.

---

## Executor Anatomy

Executors exist only in `nx-oc`. They live under `packages/nx-oc/src/executors/[name]/`:

```
schema.json       # JSON Schema for executor options
schema.d.ts       # TypeScript interface: Schema
[name].ts         # default export: async (options: Schema, context: ExecutorContext) => Promise<{ success: boolean }>
[name].spec.ts    # Jest unit tests
```

New executors must be registered in `packages/nx-oc/executors.json`.

---

## Dev Commands

Run all commands from the workspace root.

```bash
npm ci                              # install dependencies (never npm install)
npm run affected:lint               # lint only changed packages
npm run affected:test               # test only changed packages
npm run affected:build              # build only changed packages
npm run lint                        # lint all packages
npm run test                        # test all packages
npm run build                       # build all packages
nx run nx-adsp-e2e:e2e              # integration tests for nx-adsp
nx run nx-oc-e2e:e2e                # integration tests for nx-oc
nx run nx-release-e2e:e2e           # integration tests for nx-release
npx nx test nx-adsp                 # test a single package
npx nx test nx-adsp -- --update-snapshot  # update Jest snapshots
npm run format:write                # run Prettier on all files
```

Do not run `npm install`, `npx nx migrate`, or anything that modifies `nx.json`
unless explicitly directed.

---

## Code Style

- **Formatter**: Prettier with `singleQuote: true` (`.prettierrc`)
- **Linter**: ESLint with `@typescript-eslint`; `no-extra-semi` is an error
- **Quotes**: single quotes in all TypeScript files — never double quotes
- **Semicolons**: do not add semicolons at the end of statements
- **Indentation**: 2 spaces (enforced by `.editorconfig`)
- **Module boundaries**: `@nx/enforce-module-boundaries` is active; do not import
  from one package into another unless a `tsconfig.base.json` alias already exists
- **Final newline**: all files must end with a newline

---

## Testing

- **Framework**: Jest 30 via `@nx/jest/preset` (see `jest.preset.js`)
- **Snapshot format**: legacy (`escapeString: true`, `printBasicPrototype: true`) —
  do not modify `jest.preset.js` or delete existing snapshots
- **Generator unit tests**: use `createTreeWithEmptyWorkspace({ layout: 'apps-libs' })`
  from `@nx/devkit/testing`
- **Mocking nx-oc in nx-adsp tests**: `jest.mock('@abgov/nx-oc')` — required because
  nx-adsp generators call nx-oc generators at runtime
- **Test timeout**: generator tests may take up to 120 000 ms due to real `@nx` peer
  API calls; set `jest.setTimeout(120000)` when needed
- **Per-project config**: `packages/[plugin]/jest.config.ts` (use `.ts`, not `.js`)

---

## Build

- **Output**: `dist/packages/[name]/` (via `@nx/js:tsc`)
- **Dependency order**: `nx-adsp` builds after `nx-oc` because `nx-adsp` imports
  `@abgov/nx-oc`; the `^build` dependency in `nx.json` targetDefaults handles this
- **Assets**: non-TS files (`schema.json`, `generators.json`, `executors.json`,
  `files/**`) are copied by asset globs defined in each `project.json` — do not
  add logic that requires these files to be compiled
- **Cache**: build, test, lint, and e2e targets are all cached by Nx;
  `parallel: 1` in `nx.json` means tasks run sequentially — this is intentional

---

## Branching and Release

- **`main`** — stable releases (e.g. `12.0.0`)
- **`beta`** — pre-releases (e.g. `12.1.0-beta.1`); use this channel only when a
  change needs to be validated by importing the published package from a consuming
  project before it reaches stable. Changes that can be fully verified within this
  repo (docs, dependency updates, refactors, generator logic covered by unit/e2e
  tests) should target `main` directly.

### Branch workflow (required)

All changes — no matter how small — must follow this workflow:

1. Create a feature branch from `main` (or `beta` if the change is beta-only):
   `git checkout -b fix/short-description`
2. Commit changes to that branch.
3. Open a pull request targeting `main` or `beta` and wait for CI to pass.
4. **Never push commits directly to `main` or `beta`**, even when repository
   permissions allow it. Always integrate via PR.

### Version convention

**@abgov major version = Nx major version − 10**

| Nx version | @abgov packages |
|---|---|
| @nrwl/cli@11 | @abgov/nx-oc@1 |
| @nrwl/cli@12 | @abgov/nx-oc@2 |
| @nrwl/cli@15 | @abgov/nx-oc@5 |
| @nx/devkit@22 | @abgov/nx-oc@12 |

The `package.json` `version` field in this repo is a placeholder `0.0.0`.
Semantic-release sets the real published version at CI publish time.

### Release process

- Releases are triggered automatically by `release-ci.yml` on push to `main` or `beta`.
- Commit messages **must** follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`, etc.); `semantic-release` uses commit-analyzer to determine
  version bumps.
- `@abgov/nx-release` (used in each `.releaserc.json`) filters commits by Nx project
  graph paths — only commits touching a package's dependency graph trigger a version bump
  for that package.
- Do not run `npx semantic-release` locally; use `--dry-run` if you need to test.

---

## CI Pipeline

### `pull-request.yml`
Triggers on PRs to `main` and `beta`:
1. `npm run affected:lint -- --base=origin/$BASE_REF`
2. `npm run affected:test -- --base=origin/$BASE_REF`
3. `npm run affected:build -- --base=origin/$BASE_REF`

### `release-ci.yml`
Triggers on push to `main` and `beta` (uses `nrwl/nx-set-shas` to find base SHA):
1. Lint, test, build (affected)
2. `npx nx affected --target release` — semantic-release per changed package

Publishing uses OIDC (no stored NPM token); `NUGET_API_KEY` is used by `semantic-release-nuget`.

---

## ADSP Platform Notes

Generators that call `getAdspConfiguration()` — `angular-app`, `react-app`, `dotnet-service`,
`react-dotnet`, `deployment` — perform a live OAuth browser login at generation time to
retrieve tenant configuration from ADSP APIs. In unit tests these generators must be mocked:

```typescript
jest.mock('@abgov/nx-oc'); // prevents real OAuth flow in tests
```

See `packages/nx-adsp/src/generators/angular-app/angular-app.spec.ts` for the mock pattern.

ADSP environments (dev, test, prod) are defined in
`packages/nx-oc/src/adsp/environments.ts`.

---

## OpenShift Notes

- `nx-oc` generators produce `.openshift/` YAML manifests from EJS templates named `*.yml__tmpl__`.
- The `apply` executor wraps the `oc` CLI; it expects `oc` to be on `PATH`.
- `pipeline.ts` supports two `pipelineType` values: `'jenkins'` and `'actions'` (GitHub Actions).

---

## Do's

- Run `npm ci` after pulling changes that modify `package-lock.json`
- Use `createTreeWithEmptyWorkspace` for all generator unit tests
- Export new public API symbols from `packages/[plugin]/src/index.ts`
- Add new schema properties to both `schema.json` and `schema.d.ts`
- Register new generators in the package's `generators.json`
- Register new executors in `packages/nx-oc/executors.json`
- Follow `normalizeOptions → addFiles → updateProjectConfiguration → formatFiles`
- Use `names()` from `@nx/devkit` for all name transformations
- Call `formatFiles(host)` at the end of every generator
- Import from `@nx/devkit`, not from legacy `@nrwl/*` packages

## Don'ts

- Do not import across packages via relative paths — use `@abgov/*` aliases
- Do not change `parallel` in `nx.json`
- Do not commit generated `.openshift/` manifests unless adding new template files
- Do not use `jest.config.js` — all configs use `jest.config.ts`
- Do not remove the `snapshotFormat` block from `jest.preset.js`
- Do not add semicolons at the end of statements
- Do not use double quotes for strings in TypeScript files
- Do not push directly to `main` or `beta` branches
- Do not run `npx nx migrate` without explicit instruction
