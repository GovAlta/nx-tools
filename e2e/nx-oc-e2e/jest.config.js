module.exports = {
  displayName: 'nx-oc-e2e',
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
  coverageDirectory: '../../coverage/e2e/nx-oc-e2e',
  // ensureNxProject (beforeEach) does a full npm install — needs more than the default 5s
  testTimeout: 300000,
  forceExit: true,
};
