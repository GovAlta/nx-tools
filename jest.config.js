const { getJestProjects } = require('@nrwl/jest');

module.exports = {
  projects: [
    ...getJestProjects(),
    '<rootDir>/e2e/nx-adsp-e2e',
    '<rootDir>/e2e/nx-oc-e2e',
    '<rootDir>/e2e/nx-release-e2e',
    '<rootDir>/e2e/nx-dotnet-e2e',
  ],
};
