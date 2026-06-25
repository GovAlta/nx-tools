export type EnvironmentName = 'dev' | 'test' | 'prod';
interface Environment {
  accessServiceUrl: string;
  directoryServiceUrl: string;
}

export const environments: Record<EnvironmentName, Environment> = {
  dev: {
    accessServiceUrl: process.env.ADSP_E2E_ACCESS_URL ?? 'https://access.adsp-dev.gov.ab.ca',
    directoryServiceUrl: process.env.ADSP_E2E_DIRECTORY_URL ?? 'https://directory-service.adsp-dev.gov.ab.ca',
  },
  test: {
    accessServiceUrl: process.env.ADSP_E2E_ACCESS_URL ?? 'https://access-uat.alberta.ca',
    directoryServiceUrl: process.env.ADSP_E2E_DIRECTORY_URL ?? 'https://directory-service.adsp-uat.alberta.ca',
  },
  prod: {
    accessServiceUrl: process.env.ADSP_E2E_ACCESS_URL ?? 'https://access.alberta.ca',
    directoryServiceUrl: process.env.ADSP_E2E_DIRECTORY_URL ?? 'https://directory-service.adsp.alberta.ca',
  },
};
