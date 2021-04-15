import { AdspConfiguration } from '../../utils/adsp';

export interface Schema {
  name: string;
  tenant: string;
  namespace?: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  adsp: AdspConfiguration;
  namespace: string;
}
