// project-docs-ancestors: cli-designs:keystone-init

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  chmodSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { confine, contains } from '../core/confine';
import { placementMode } from '../core/rules';
import { Refusal } from '../core/refusal';

export interface PlacementRequest {
  readonly sourceRoot: string;
  readonly target: string;
  readonly files: readonly string[];
  /**
   * Whether the caller accepted a source carrying local modifications.
   *
   * A tracked path missing from the working tree is one such modification — `rm` a tracked file
   * and the tree no longer matches its index — so refusing it past the flag would contradict the
   * requirement that the flag exists to satisfy. Absent, it is a refusal.
   */
  readonly acceptLocalModifications?: boolean;
}

/**
 * Whether a path exists, INCLUDING a symlink whose destination does not.
 *
 * `existsSync` follows links, so it answers false for a dangling one — and a dangling symlink at a
 * declared path is the worst case rather than a harmless one: reported as "no collision", a copy
 * then follows the link and writes outside the target. It is also a file the installer did not
 * place, which is reason enough by itself.
 */
function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Which declared paths already exist in the target, so `assessTarget` can decide without I/O. */
export function collisions(target: string, files: readonly string[]): string[] {
  return files.filter((f) => present(join(target, f)));
}

/**
 * The deepest ancestor of a path that already exists, resolved through any symlinks.
 *
 * Confinement on the declared path alone is lexical, so with `target/tools` already a symlink
 * elsewhere, `target/tools/x.md` looks inside the target and is not. Resolving the part of the
 * chain that exists is what lets the check see through that.
 */
function realExistingAncestor(path: string): string {
  let current = dirname(path);
  for (;;) {
    if (existsSync(current)) {
      return realpathSync(current);
    }
    const parent = dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
}

/**
 * Every declared path judged BEFORE anything is written.
 *
 * Separate from the write loop on purpose: a refusal must leave the target untouched, so each of
 * these is established while nothing has been written yet — invariant 6. Anything discoverable
 * here and left to the write loop becomes a partial placement instead of a refusal.
 *
 * Returns the first refusal, or null.
 */
export function unconfined(request: PlacementRequest): Refusal | null {
  // BOTH SIDES RESOLVED, or the comparison below is against two spellings of one directory. On
  // macOS `/tmp` and `/var` are themselves symlinks into `/private`, so realpathing only the
  // ancestor made every path in a temp target look like an escape. Resolving both is what makes
  // the check answer about location rather than about spelling.
  const targetRoot = existsSync(request.target)
    ? realpathSync(request.target)
    : resolve(request.target);

  for (const file of request.files) {
    const escapes = (): Refusal => ({
      condition: 'path-escapes-target',
      target: request.target,
      path: file,
    });

    // 1. The declared path itself: absolute, or traversing above the target.
    const declared = confine(targetRoot, file);
    if (!declared.permitted) {
      return escapes();
    }

    // 2. The target's own tree, resolved: an existing symlinked directory on the way would carry
    //    the write outside, and a lexical check cannot see it.
    const ancestor = realExistingAncestor(declared.absolute);
    if (ancestor !== targetRoot && !contains(targetRoot, ancestor)) {
      return escapes();
    }

    // 3. An ancestor occupied by something that is not a directory. Checkable now; left to the
    //    write loop it surfaces as ENOTDIR with files already placed.
    for (
      let dir = dirname(declared.absolute);
      contains(targetRoot, dir);
      dir = dirname(dir)
    ) {
      if (present(dir) && !lstatSync(dir).isDirectory()) {
        return {
          condition: 'target-file-collision',
          target: request.target,
          path: file,
        };
      }
    }

    // 4. The source must hold what its index declares. A tracked path missing from the working
    //    tree means the tree is not the commit, so the placement would not be what was asked for.
    const sourcePath = join(request.sourceRoot, file);
    if (!present(sourcePath)) {
      if (request.acceptLocalModifications) {
        continue;
      }
      return { condition: 'source-missing-declared-path', path: file };
    }

    // 5. A tracked symlink is refused outright rather than resolved. The write reads through a
    //    link, so following one would copy content from outside the source into the project, and a
    //    link to a directory cannot be written as a file at all. No harness distribution declares
    //    one today (measured: zero tracked symlinks), so refusing costs nothing and supporting
    //    them would be a security surface added for no present purpose.
    if (lstatSync(sourcePath).isSymbolicLink()) {
      return { condition: 'source-declares-a-symlink', path: file };
    }
  }

  return null;
}

/**
 * Write the declared set into the target.
 *
 * Called only after every precondition above has been established, which is what makes a refusal
 * mean an untouched target. It is NOT atomic: an I/O failure part-way through leaves the files
 * written so far, and no rule requires otherwise.
 */
export function place(request: PlacementRequest): number {
  let written = 0;
  for (const file of request.files) {
    const from = join(request.sourceRoot, file);
    // Skipped rather than failed only where the caller accepted local modifications; without that
    // flag `unconfined` has already refused, so this cannot silently drop a file.
    if (request.acceptLocalModifications && !existsSync(from)) {
      continue;
    }
    const to = join(request.target, file);
    mkdirSync(dirname(to), { recursive: true });

    // Written with its final mode rather than copied and then narrowed: copyFileSync propagates
    // the source's mode, so a wide source file existed world-writable for one syscall — on the
    // hook that runs at every commit, which is the whole reason the bound exists. The explicit
    // chmod follows because writeFileSync's mode is subject to umask.
    const mode = placementMode(lstatSync(from).mode);
    writeFileSync(to, readFileSync(from), { mode });
    chmodSync(to, mode);
    written += 1;
  }
  return written;
}
