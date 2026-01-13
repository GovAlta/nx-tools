import { getJestProjectsAsync } from '@nx/jest';

export default async () => ({
  projects: [
    ...(await getJestProjectsAsync()),
    '<rootDir>/e2e/nx-adsp-e2e',
    '<rootDir>/e2e/nx-oc-e2e',
    '<rootDir>/e2e/nx-release-e2e',
  ],
});
