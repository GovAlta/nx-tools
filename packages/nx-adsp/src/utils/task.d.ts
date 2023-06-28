export interface QueueDefinition {
  namespace: string;
  name: string;
  assignerRoles: string[];
  workerRoles: string[];
}
