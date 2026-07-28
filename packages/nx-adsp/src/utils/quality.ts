import {
  readProjectConfiguration,
  Tree,
  updateJson,
  updateProjectConfiguration,
  writeJson,
} from '@nx/devkit';

/**
 * Rewrites the project-level eslint.config.mjs to add:
 * - eslint-plugin-security (all source files)
 * - eslint-plugin-no-secrets (all source files, entropy-based secret detection)
 * - eslint-plugin-jest with no-disabled-tests (test files only)
 *
 * All three packages must be added as dev dependencies by the calling generator.
 */
export function addEslintQualityRules(
  host: Tree,
  projectRoot: string,
  testFileGlobs: string[],
): void {
  const eslintPath = `${projectRoot}/eslint.config.mjs`;
  if (!host.exists(eslintPath)) return;

  const existing = host.read(eslintPath).toString();
  const baseConfigMatch = existing.match(
    /from ['"](.+eslint\.config\.[cm]?[jt]s)['"]/,
  );
  const baseConfigPath = baseConfigMatch?.[1] ?? '../../eslint.config.mjs';
  const fileGlobList = testFileGlobs.map((g) => `'${g}'`).join(', ');

  host.write(
    eslintPath,
    `import baseConfig from '${baseConfigPath}';
import pluginSecurity from 'eslint-plugin-security';
import pluginNoSecrets from 'eslint-plugin-no-secrets';
import pluginJest from 'eslint-plugin-jest';

export default [
  ...baseConfig,
  pluginSecurity.configs.recommended,
  {
    plugins: { 'no-secrets': pluginNoSecrets },
    rules: {
      'no-secrets/no-secrets': ['error', { tolerance: 4.2 }],
    },
  },
  {
    files: [${fileGlobList}],
    ...pluginJest.configs['flat/recommended'],
    rules: {
      ...pluginJest.configs['flat/recommended'].rules,
      'jest/no-disabled-tests': 'error',
    },
  },
];
`,
  );
}

/**
 * Adds collectCoverage, a 60% line coverage threshold, and terminal-visible
 * coverage reporters to the project's jest.config.cts. The threshold is
 * inactive until the first test file is added (passWithNoTests exits before
 * coverage is checked).
 *
 * @nx/jest's shared preset sets `coverageReporters: ['html']` — a report
 * written to disk, with nothing printed to the terminal even when coverage
 * runs. That's a real gap for a coding agent, whose main feedback loop *is*
 * the terminal: a threshold failure alone only says the aggregate number
 * dropped, not which files or lines are under it. `text` is set directly in
 * this project's own jest.config.cts (overriding the preset's list for this
 * project only, without touching the shared preset every other project
 * inherits) so every `nx test` run prints the full per-file breakdown.
 */
export function addJestCoverageConfig(host: Tree, projectRoot: string): void {
  const jestPath = `${projectRoot}/jest.config.cts`;
  if (!host.exists(jestPath)) return;

  const existing = host.read(jestPath).toString();
  // Capture the coverageDirectory line WITHOUT its trailing comma, then re-emit
  // it with one before the inserted properties. @nx/jest may leave
  // coverageDirectory as the last property (no trailing comma), so appending
  // properties after it verbatim would produce an invalid object literal.
  const modified = existing.replace(
    /([ \t]*coverageDirectory:[^\n]*?),?\n/,
    `$1,\n  collectCoverage: true,\n  coverageReporters: ['html', 'text'],\n  coverageThreshold: {\n    global: {\n      lines: 60,\n    },\n  },\n`,
  );
  if (modified !== existing) {
    host.write(jestPath, modified);
  }
}

/**
 * Writes (or merges into) .vscode/settings.json at the workspace root to
 * enable format-on-save via Prettier and ESLint fix-on-save.
 * Both extensions are already recommended in the Nx-generated extensions.json.
 */
export function addSemgrepTarget(host: Tree, projectName: string): void {
  const config = readProjectConfiguration(host, projectName);
  config.targets = {
    ...config.targets,
    semgrep: {
      executor: 'nx:run-commands',
      inputs: ['default'],
      cache: true,
      options: {
        command: 'semgrep scan --config=p/owasp-top-ten --error .',
        cwd: '{projectRoot}',
      },
    },
  };
  updateProjectConfiguration(host, projectName, config);
}

/**
 * Makes the generated Playwright e2e config skip its local dev-server when
 * BASE_URL is set. @nx/playwright's config already reads BASE_URL for `baseURL`
 * (its own comment says "for CI, set BASE_URL to the deployed application"), but
 * its `webServer` block would still start a local `nx serve` in CI. Guarding it on
 * BASE_URL lets the same suite run locally (spins the dev server) or against a
 * deployed URL in the pipeline (no local server) — see the pipeline's e2e jobs.
 *
 * This is @nx/playwright's own documented pattern for testing a hosted target
 * (point `baseURL` at the deployment, leave `webServer` out); the common idiom is
 * `webServer: process.env.CI ? undefined : {...}` — we key on BASE_URL instead so
 * the server is only dropped when we actually have a deployed URL. It also avoids
 * the serve/webServer double-start race in nx that has no clean built-in fix:
 * https://github.com/nrwl/nx/issues/34698 (the pipeline additionally passes
 * --exclude-task-dependencies to skip nx's cached inferred `serve` dependsOn).
 *
 * Idempotent and a no-op if the config lacks a webServer or is already guarded.
 */
export function guardPlaywrightWebServer(
  host: Tree,
  e2eProjectRoot: string,
): void {
  for (const ext of ['mts', 'ts', 'cts', 'js', 'mjs']) {
    const configPath = `${e2eProjectRoot}/playwright.config.${ext}`;
    if (!host.exists(configPath)) continue;
    const cfg = host.read(configPath).toString();
    if (cfg.includes('process.env.BASE_URL') || !cfg.includes('webServer: {'))
      return;
    host.write(
      configPath,
      cfg.replace(
        'webServer: {',
        'webServer: process.env.BASE_URL ? undefined : {',
      ),
    );
    return;
  }
}

/**
 * Fixes two bugs that surface when e2e testing is added to express-service,
 * confirmed by actually running the generated `e2e` target rather than just
 * inspecting the templates. The two have different owners — kept together
 * here only because both need fixing at the same call site, not because
 * they share a cause:
 *
 * 1. UPSTREAM BUG, not nx-adsp's — lives entirely inside `@nx/node`'s own
 *    `e2e-project` generator (triggered here via `e2eTestRunner: 'jest'` on
 *    the express application generator). Nothing about nx-adsp's own code
 *    causes it, and it would reproduce in a plain `@nx/node`/`@nx/express`
 *    workspace with no nx-adsp involved at all. Kept as a local workaround
 *    anyway since nx-adsp doesn't control Nx's release cadence and a safe
 *    no-op against already-correct output (see below) costs nothing if
 *    upstream fixes it later — worth reporting to `nrwl/nx` regardless.
 *
 *    `@nx/node:e2e-project` writes one of two shapes for `jest.config.cts`
 *    depending on whether `@swc/jest` is present in the workspace — not
 *    necessarily for this project itself; a Vue/React app elsewhere in a
 *    multi-app workspace pulling in `@swc/core` for its own build is enough
 *    to flip it. The `@swc/jest` shape is `export default {...}` with a
 *    top-level `import` — ESM syntax in a `.cts` file, which Node/ts-jest/SWC
 *    always treat as CommonJS regardless of the workspace's own
 *    `package.json` "type". Jest's own config loader (unlike its `transform`
 *    pipeline, which only applies to *test* files) can't reconcile the two,
 *    so the config fails to parse before a single test runs — every target
 *    that reads it breaks outright with `SyntaxError: Cannot use import
 *    statement outside a module`. Rewritten to `const {...} = require(...)`
 *    / `module.exports = {...}`, matching both the pattern the service's own
 *    `jest.config.cts` already uses correctly and the ts-jest shape
 *    `@nx/node` writes when `@swc/jest` isn't present — which needs no fix,
 *    so the two replaces below are safe no-ops against it.
 *
 *    (`src/support/*.ts` also import at the top level, but — verified by
 *    running the target — those are plain `.ts` files that DO go through
 *    the config's `transform` pipeline, so they don't need this fix; only
 *    the config file itself, read before that pipeline exists, does.)
 *
 * 2. OUR OWN BUG, not Nx's — a convention mismatch entirely on nx-adsp's
 *    side, not a defect in the upstream generator. `@nx/node:e2e-project`'s
 *    fallback port of `3000` is a reasonable generic default with no
 *    knowledge of any particular caller; it's only wrong here because
 *    nx-adsp's own `environment.ts.__tmpl__` defaults `PORT` to `3333`
 *    instead (matching `@nx/express`'s own scaffolded `main.ts` before
 *    nx-adsp replaces it), and until this fix nothing reconciled the two.
 *    There's no upstream fix to wait for — reconciling nx-adsp's own port
 *    convention with whatever generates the e2e project is squarely
 *    nx-adsp's job. Confirmed via a real run:
 *    the express app logs `Listening at http://localhost:3333`, while
 *    `global-setup.ts` waits on `3000` and never sees it open — the target
 *    hangs, then fails with `Jest: Got error running globalSetup ...
 *    reason: [AggregateError]`, no port number anywhere in the message.
 */
export function fixExpressServiceE2eProject(
  host: Tree,
  e2eProjectRoot: string,
  port: number,
): void {
  const jestConfigPath = `${e2eProjectRoot}/jest.config.cts`;
  if (host.exists(jestConfigPath)) {
    const cfg = host
      .read(jestConfigPath)
      .toString()
      .replace(
        /^import \{([^}]+)\} from '([^']+)';$/m,
        "const {$1} = require('$2');",
      )
      .replace(/^export default \{/m, 'module.exports = {');
    host.write(jestConfigPath, cfg);
  }

  for (const file of ['global-setup.ts', 'global-teardown.ts']) {
    const path = `${e2eProjectRoot}/src/support/${file}`;
    if (!host.exists(path)) continue;
    host.write(
      path,
      host
        .read(path)
        .toString()
        .replace(
          /process\.env\.PORT \? Number\(process\.env\.PORT\) : 3000/,
          `process.env.PORT ? Number(process.env.PORT) : ${port}`,
        ),
    );
  }

  const testSetupPath = `${e2eProjectRoot}/src/support/test-setup.ts`;
  if (host.exists(testSetupPath)) {
    host.write(
      testSetupPath,
      host
        .read(testSetupPath)
        .toString()
        .replace(
          /process\.env\.PORT \?\? '3000'/,
          `process.env.PORT ?? '${port}'`,
        ),
    );
  }
}

export function addVsCodeSettings(host: Tree): void {
  const settingsPath = '.vscode/settings.json';
  const settings = {
    'editor.formatOnSave': true,
    'editor.defaultFormatter': 'esbenp.prettier-vscode',
    'editor.codeActionsOnSave': {
      'source.fixAll.eslint': 'explicit',
    },
  };

  if (host.exists(settingsPath)) {
    updateJson(host, settingsPath, (existing) => ({
      ...existing,
      ...settings,
    }));
  } else {
    writeJson(host, settingsPath, settings);
  }
}

/**
 * Registers the @abgov/adsp-sdk-mcp-server MCP server in the workspace-root
 * `.mcp.json` so a coding agent (Claude Code and other MCP clients) can look up
 * grounded ADSP docs and `@abgov/adsp-service-sdk` reference instead of guessing.
 *
 * It's a stdio knowledge server (no credentials, run via npx), so wiring is just
 * config. Merges into an existing `.mcp.json` and never clobbers a user-customized
 * `adsp-sdk` entry, so it's safe to re-run and to run for every generated service.
 *
 * The reconnect reminder lives here, not in each caller — project-scoped MCP
 * servers load at session start, so a file write mid-session (whether from
 * an app/service generator or the standalone `init` generator) leaves the
 * entry configured but inert until the client reconnects, and every caller
 * needs to say so, not just one.
 */
export function addAdspMcpServer(host: Tree): void {
  const mcpPath = '.mcp.json';
  const server = { command: 'npx', args: ['-y', '@abgov/adsp-sdk-mcp-server'] };

  if (host.exists(mcpPath)) {
    updateJson(host, mcpPath, (existing) => {
      const mcpServers = { ...(existing?.mcpServers ?? {}) };
      // Preserve an existing entry (a team may have pinned a version or repointed
      // it at a local build) — only add ours when it isn't already configured.
      mcpServers['adsp-sdk'] = mcpServers['adsp-sdk'] ?? server;
      return { ...existing, mcpServers };
    });
  } else {
    writeJson(host, mcpPath, { mcpServers: { 'adsp-sdk': server } });
  }

  console.log(
    '\n✓ .mcp.json configures the ADSP SDK MCP server (adsp-sdk).\n' +
      '  Project-scoped MCP servers load at session start, not on a mid-session file\n' +
      '  change — reconnect (or restart) your MCP client now before relying on it.\n',
  );
}
