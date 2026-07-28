import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { addJestCoverageConfig, fixExpressServiceE2eProject } from './quality';

function makeConfig(coverageDirectoryLine: string): string {
  return [
    'module.exports = {',
    "  displayName: 'svc',",
    "  preset: '../../jest.preset.js',",
    `  ${coverageDirectoryLine}`,
    '};',
    '',
  ].join('\n');
}

// Parse the exported object literal; throws SyntaxError if the config is invalid
// (e.g. a property with no separating comma).
function evalConfigObject(src: string): Record<string, unknown> {
  const body = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
  return new Function(`return (${body})`)() as Record<string, unknown>;
}

describe('addJestCoverageConfig', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('inserts a comma when coverageDirectory is the last property (no trailing comma)', () => {
    // The @nx/jest (Nx 23) template leaves coverageDirectory without a trailing comma.
    tree.write(
      'apps/svc/jest.config.cts',
      makeConfig("coverageDirectory: 'test-output/jest/coverage'"),
    );

    addJestCoverageConfig(tree, 'apps/svc');
    const out = tree.read('apps/svc/jest.config.cts').toString();

    expect(out).toContain("coverageDirectory: 'test-output/jest/coverage',");
    expect(out).toContain('collectCoverage: true,');
    expect(out).toContain("coverageReporters: ['html', 'text'],");
    expect(out).toContain('lines: 60,');
    expect(out).not.toContain(',,');
    // The result must be a valid object literal.
    const cfg = evalConfigObject(out);
    expect(cfg.collectCoverage).toBe(true);
    expect(cfg.coverageReporters).toEqual(['html', 'text']);
    expect(
      (cfg.coverageThreshold as { global: { lines: number } }).global.lines,
    ).toBe(60);
  });

  it('does not double the comma when coverageDirectory already has one', () => {
    tree.write(
      'apps/svc/jest.config.cts',
      makeConfig("coverageDirectory: '../../coverage/svc',"),
    );

    addJestCoverageConfig(tree, 'apps/svc');
    const out = tree.read('apps/svc/jest.config.cts').toString();

    expect(out).toContain("coverageDirectory: '../../coverage/svc',");
    expect(out).not.toContain(',,');
    expect(() => evalConfigObject(out)).not.toThrow();
  });

  it('is a no-op when there is no jest config', () => {
    expect(() => addJestCoverageConfig(tree, 'apps/none')).not.toThrow();
    expect(tree.exists('apps/none/jest.config.cts')).toBe(false);
  });
});

describe('fixExpressServiceE2eProject', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  // Byte-for-byte what @nx/node:e2e-project actually writes when the
  // workspace has @swc/jest available — confirmed via a real `nx e2e` run,
  // which failed to parse with exactly this shape.
  const SWC_JEST_CONFIG = `/* eslint-disable */
import { readFileSync } from 'fs';

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(\`\${__dirname}/.spec.swcrc\`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

export default {
  displayName: '@org/test-service-e2e',
  preset: '../jest.preset.js',
  globalSetup: '<rootDir>/src/support/global-setup.ts',
  globalTeardown: '<rootDir>/src/support/global-teardown.ts',
  setupFiles: ['<rootDir>/src/support/test-setup.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
`;

  // What @nx/node:e2e-project writes when the workspace uses ts-jest instead
  // (this repo's own case) — already valid CommonJS, nothing to fix.
  const TS_JEST_CONFIG = `module.exports = {
  displayName: 'test-e2e',
  preset: '../../jest.preset.js',
  globalSetup: '<rootDir>/src/support/global-setup.ts',
  globalTeardown: '<rootDir>/src/support/global-teardown.ts',
  setupFiles: ['<rootDir>/src/support/test-setup.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\\\.[tj]s$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.spec.json',
    }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/test-e2e',
};
`;

  const GLOBAL_SETUP = `import { waitForPortOpen } from '@nx/node/utils';

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

module.exports = async function () {
  console.log('\\nSetting up...\\n');

  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await waitForPortOpen(port, { host });

  globalThis.__TEARDOWN_MESSAGE__ = '\\nTearing down...\\n';
};
`;

  const GLOBAL_TEARDOWN = `import { killPort } from '@nx/node/utils';
/* eslint-disable */

module.exports = async function () {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await killPort(port);
  console.log(globalThis.__TEARDOWN_MESSAGE__);
};
`;

  const TEST_SETUP = `/* eslint-disable */
import axios from 'axios';

module.exports = async function () {
  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? '3000';
  axios.defaults.baseURL = \`http://\${host}:\${port}\`;
};
`;

  function writeE2eProject(root: string, jestConfig: string): void {
    tree.write(`${root}/jest.config.cts`, jestConfig);
    tree.write(`${root}/src/support/global-setup.ts`, GLOBAL_SETUP);
    tree.write(`${root}/src/support/global-teardown.ts`, GLOBAL_TEARDOWN);
    tree.write(`${root}/src/support/test-setup.ts`, TEST_SETUP);
  }

  it('rewrites the @swc/jest variant of jest.config.cts to CommonJS', () => {
    writeE2eProject('apps/svc-e2e', SWC_JEST_CONFIG);

    fixExpressServiceE2eProject(tree, 'apps/svc-e2e', 3333);

    const out = tree.read('apps/svc-e2e/jest.config.cts').toString();
    expect(out).not.toContain('export default');
    expect(out).not.toMatch(/^import /m);
    expect(out).toContain('module.exports = {');
    expect(out).toContain("const { readFileSync } = require('fs');");
  });

  it('leaves the ts-jest variant of jest.config.cts untouched (already valid CommonJS)', () => {
    writeE2eProject('apps/svc-e2e', TS_JEST_CONFIG);

    fixExpressServiceE2eProject(tree, 'apps/svc-e2e', 3333);

    expect(tree.read('apps/svc-e2e/jest.config.cts').toString()).toBe(
      TS_JEST_CONFIG,
    );
  });

  it('fixes the hardcoded port default in all three support files', () => {
    writeE2eProject('apps/svc-e2e', TS_JEST_CONFIG);

    fixExpressServiceE2eProject(tree, 'apps/svc-e2e', 3333);

    const setup = tree
      .read('apps/svc-e2e/src/support/global-setup.ts')
      .toString();
    expect(setup).toContain(
      'process.env.PORT ? Number(process.env.PORT) : 3333',
    );
    const teardown = tree
      .read('apps/svc-e2e/src/support/global-teardown.ts')
      .toString();
    expect(teardown).toContain(
      'process.env.PORT ? Number(process.env.PORT) : 3333',
    );
    const testSetup = tree
      .read('apps/svc-e2e/src/support/test-setup.ts')
      .toString();
    expect(testSetup).toContain("process.env.PORT ?? '3333'");
  });

  it('is a no-op when there is no e2e project at that root', () => {
    expect(() =>
      fixExpressServiceE2eProject(tree, 'apps/none-e2e', 3333),
    ).not.toThrow();
    expect(tree.exists('apps/none-e2e/jest.config.cts')).toBe(false);
  });
});
