import { EnvironmentName } from '../../utils/environments';

export interface Schema {
  name: string;
  env: EnvironmentName;
  realm: string;
}
