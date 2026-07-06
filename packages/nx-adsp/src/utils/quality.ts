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
