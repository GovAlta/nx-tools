// Nx 23 exposes `@nx/angular/generators` only via its package `exports` map.
// This workspace compiles with `moduleResolution: "node"` (classic), which does
// not read `exports` maps, so TypeScript cannot locate the types even though the
// module resolves correctly at runtime. This thin ambient declaration types the
// single symbol we consume (`applicationGenerator`) until the workspace moves to
// `moduleResolution: "bundler"`/`"node16"`.
declare module '@nx/angular/generators' {
  import type { Tree } from '@nx/devkit';

  export function applicationGenerator(
    tree: Tree,
    options: Record<string, unknown>
  ): Promise<void>;
}
