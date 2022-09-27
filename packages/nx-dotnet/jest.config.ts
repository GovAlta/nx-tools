/* eslint-disable */
export default {
  displayName: 'nx-dotnet',
  preset: '../../jest.preset.js',
  globals: {
    'ts-jest': { tsconfig: '<rootDir>/tsconfig.spec.json' },
  },
  transform: {
    '^.+\\.[tj]sx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/packages/nx-dotnet',
  testEnvironment: 'node',
  testMatch: ['**/(*.)+(spec|test).[jt]s?(x)'],
};
