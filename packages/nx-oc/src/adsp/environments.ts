export type EnvironmentName = 'dev' | 'test' | 'prod';
interface Environment {
  accessServiceUrl: string;
  directoryServiceUrl: string;
}

export const environments: Record<EnvironmentName, Environment> = {
  dev: {
    accessServiceUrl: 'https://access.adsp-dev.gov.ab.ca',
    directoryServiceUrl: 'https://directory-service.adsp-dev.gov.ab.ca',
  },
  test: {
    accessServiceUrl: 'https://access-uat.alberta.ca',
    directoryServiceUrl: 'https://directory-service.adsp-uat.alberta.ca',
  },
  prod: {
    accessServiceUrl: 'https://access.alberta.ca',
    directoryServiceUrl: 'https://directory-service.adsp.alberta.ca',
  },
};
