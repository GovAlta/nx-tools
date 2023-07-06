import { EnvironmentName } from '@abgov/nx-oc';
import { QueueDefinition } from '../../utils/task';

export interface Schema {
  project: string;
  env: EnvironmentName;
  accessToken?: string;
}

export interface NormalizedSchema extends Schema {
  projectRoot: string;
  queueDefinition: QueueDefinition;
  updateStreamId: string;
}
