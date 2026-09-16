// project-docs-ancestors: cli-designs:keystone-init

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const RECORD_PATH = '.keystone/install.json';

export interface ProvenanceRecord {
  readonly repository: string;
  readonly ref: string | null;
  readonly commit: string;
  readonly installer: string;
}

/**
 * Record the one thing the harness cannot know about itself: which commit this copy came from.
 *
 * DELIBERATELY SMALL, and it was not. An earlier version wrote a seven-field parallel record —
 * route, acceptance, a timestamp — duplicating what the harness's own configuration step already
 * stamps (`harnessVersion` in its own config, which has a producer and no consumer). The harness
 * owns describing itself; what it cannot derive is the ref and commit it was fetched at, because a
 * copy has no remote. So that is what this holds, and nothing else.
 *
 * Written where the harness's ignore rules leave it tracked, so it reaches the first commit. NOT
 * written into the harness's own config file, which belongs to its configuration step and refuses
 * to run if it already exists.
 *
 * `repository` is an identity, never a URL: a URL is where a credential appears.
 */
export function writeProvenance(
  target: string,
  record: ProvenanceRecord,
): ProvenanceRecord {
  const path = join(target, RECORD_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/**
 * Pin this installer into the target's manifest, so the lockfile carries the version too.
 *
 * Being named in the manifest is not the same as the harness depending on it: nothing the harness
 * runs imports from this package, and removing the entry leaves a working harness.
 */
export function pinInstaller(target: string, version: string): boolean {
  const path = join(target, 'package.json');
  if (!existsSync(path)) {
    return false;
  }
  const manifest = JSON.parse(readFileSync(path, 'utf-8'));
  const dev = manifest.devDependencies ?? {};
  if (dev['@abgov/keystone']) {
    return false;
  }
  dev['@abgov/keystone'] = `^${version}`;
  manifest.devDependencies = dev;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return true;
}
