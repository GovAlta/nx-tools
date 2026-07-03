import { ApplicationType, DatabaseType } from '../../generators/deployment/schema';

export interface SandboxExecutorSchema {
  sandboxProject: string;
  registry: string;
  database?: DatabaseType;
  appType?: ApplicationType;
  imageTag?: string;
  skipBuild?: boolean;
  skipPush?: boolean;
  importRetries?: number;
}
