import { readProjectConfiguration, Tree, updateJson, updateProjectConfiguration, writeJson } from '@nx/devkit';

/**
 * Rewrites the project-level eslint.config.mjs to add:
 * - eslint-plugin-security (all source files)
 * - eslint-plugin-no-secrets (all source files, entropy-based secret detection)
 * - eslint-plugin-jest with no-disabled-tests (test files only)
 *
 * All three packages must be added as dev dependencies by the calling generator.
 */
export function addEslintQualityRules(host: Tree, projectRoot: string, testFileGlobs: string[]): void {
  const eslintPath = `${projectRoot}/eslint.config.mjs`;
  if (!host.exists(eslintPath)) return;

  const existing = host.read(eslintPath).toString();
  const baseConfigMatch = existing.match(/from ['"](.+eslint\.config\.[cm]?[jt]s)['"]/);
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
`
  );
}

/**
 * Adds collectCoverage and a 60% line coverage threshold to the project's
 * jest.config.cts. The threshold is inactive until the first test file is
 * added (passWithNoTests exits before coverage is checked).
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
    `$1,\n  collectCoverage: true,\n  coverageThreshold: {\n    global: {\n      lines: 60,\n    },\n  },\n`
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
export function guardPlaywrightWebServer(host: Tree, e2eProjectRoot: string): void {
  for (const ext of ['mts', 'ts', 'cts', 'js', 'mjs']) {
    const configPath = `${e2eProjectRoot}/playwright.config.${ext}`;
    if (!host.exists(configPath)) continue;
    const cfg = host.read(configPath).toString();
    if (cfg.includes('process.env.BASE_URL') || !cfg.includes('webServer: {')) return;
    host.write(
      configPath,
      cfg.replace('webServer: {', 'webServer: process.env.BASE_URL ? undefined : {')
    );
    return;
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
    updateJson(host, settingsPath, (existing) => ({ ...existing, ...settings }));
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
}
