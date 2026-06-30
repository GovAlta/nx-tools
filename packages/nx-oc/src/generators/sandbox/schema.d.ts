import { AdspConfiguration } from '../../adsp';
import { ApplicationType, DatabaseType } from '../deployment/schema';

export interface Schema {
  project: string;
  appType?: ApplicationType;
  sandboxProject: string;
  database?: DatabaseType;
  env?: string;
  adsp?: AdspConfiguration;
  accessToken?: string;
  tenant?: string;
  tenantRealm?: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  appType: ApplicationType;
  adsp: AdspConfiguration;
  buildOutputPath: string;
}
