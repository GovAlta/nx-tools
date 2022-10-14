import { AdspConfiguration } from "../../utils/adsp";

export interface Schema {
  name: string;
  tenant: string;
  realm: string;
}

export interface NormalizedSchema extends Schema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  openshiftDirectory: string;
  adsp: AdspConfiguration
}
