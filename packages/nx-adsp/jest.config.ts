/* eslint-disable */
export default {
  displayName: 'nx-adsp',
  preset: '../../jest.preset.js',
  globals: {
    'ts-jest': { tsconfig: '<rootDir>/tsconfig.spec.json' },
  },
  transform: {
    '^.+\\.[tj]sx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '@nrwl/angular/src/utils/test-runners': '<rootDir>/../../node_modules/@nrwl/angular/src/utils/test-runners.js',
  },
  coverageDirectory: '../../coverage/packages/nx-adsp',
  testEnvironment: 'node',
};
