module.exports = {
  displayName: 'nx-release-e2e',
  preset: '../../jest.preset.js',
  globals: {},
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsConfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/e2e/nx-release-e2e',
  // ensureNxProject + copyNodeModules (beforeEach) do a full npm install — needs more than the default 5s
  testTimeout: 300000,
  forceExit: true,
};
