module.exports = {
  displayName: 'nx-adsp-e2e',
  preset: '../../jest.preset.js',
  globals: {},
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/e2e/nx-adsp-e2e',
  // setupE2eWorkspace (beforeEach) does a full npm install — needs more than the default 5s
  testTimeout: 300000,
};
