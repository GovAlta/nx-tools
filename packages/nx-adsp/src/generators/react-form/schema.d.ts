import { EnvironmentName } from '@abgov/nx-oc';
import { FormDefinition } from '../../utils/form';

export interface Schema {
  project: string;
  env: EnvironmentName;
  accessToken?: string;
}

export interface NormalizedSchema extends Schema {
  projectRoot: string;
  formDefinition: FormDefinition;
}
