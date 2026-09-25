export type ArchiveReason = 'completed' | 'deferred';

export interface Schema {
  featurePath: string;
  archiveReason: ArchiveReason;
}
