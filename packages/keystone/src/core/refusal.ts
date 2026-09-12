// project-docs-ancestors: cli-designs:keystone-init

/**
 * Every way a placement declines to act, as data.
 *
 * A refusal ALWAYS means the target was not written to. That is precondition checking rather than
 * atomicity, and the difference is worth keeping straight: an I/O failure part-way through a write
 * leaves files behind and is not a refusal. What this type covers is everything established before
 * the first write.
 *
 * `describe` renders the text because the text is the contract. An agent reads a refusal and acts
 * on it without inspecting the tree, so naming the specific path is the part that matters —
 * "target not empty" is a sentence nothing can act on.
 */
export type Refusal =
  | { readonly condition: 'target-carries-harness'; readonly target: string }
  | {
      readonly condition: 'target-file-collision';
      readonly target: string;
      readonly path: string;
    }
  | {
      readonly condition: 'source-declares-no-set';
      readonly commit: string;
      readonly version: string;
    }
  | {
      readonly condition: 'path-escapes-target';
      readonly target: string;
      readonly path: string;
    }
  | {
      readonly condition: 'source-identity-mismatch';
      readonly declared: string;
      readonly expected: string;
    }
  | { readonly condition: 'source-not-a-harness'; readonly path: string }
  | {
      readonly condition: 'source-missing-declared-path';
      readonly path: string;
    }
  | { readonly condition: 'source-declares-a-symlink'; readonly path: string }
  | {
      readonly condition: 'source-exports-no-predicate';
      readonly commit: string;
    }
  | { readonly condition: 'fetch-failed'; readonly detail: string }
  | { readonly condition: 'target-carries-no-harness'; readonly target: string }
  | { readonly condition: 'upgrade-refused'; readonly detail: string }
  | {
      readonly condition: 'target-configures-hooks-path';
      readonly target: string;
      readonly value: string;
    }
  | {
      readonly condition: 'fetch-remote-redirected';
      readonly effective: string;
      readonly repository: string;
    };

export function describe(refusal: Refusal): string {
  switch (refusal.condition) {
    case 'target-carries-harness':
      return (
        `${refusal.target} already carries the harness. ` +
        `To update it, run: keystone upgrade --target ${refusal.target}`
      );
    case 'target-file-collision':
      return (
        `${refusal.target}/${refusal.path} already exists and this placement would overwrite it. ` +
        `Placement will not overwrite a file it did not place.`
      );
    case 'source-declares-no-set':
      return (
        `The source at ${refusal.commit} declares no distribution set ` +
        `(version ${refusal.version}), so there is nothing to place from it.`
      );
    case 'path-escapes-target':
      return (
        `The declared path ${refusal.path} resolves outside ${refusal.target}, ` +
        `and placement writes only inside the target.`
      );
    case 'source-identity-mismatch':
      return (
        `The source declares itself to be ${refusal.declared}, not ${refusal.expected}. ` +
        `Placement reads only the pinned harness repository.`
      );
    // Distinct from a mismatch: a tree with no manifest at all declares nothing, and saying it
    // "declares itself to be no harness manifest" is a sentence about our own bookkeeping rather
    // than about what was found.
    case 'source-not-a-harness':
      return `${refusal.path} carries no harness manifest, so it is not a harness source.`;
    case 'source-missing-declared-path':
      return (
        `The source declares ${refusal.path} but does not hold it, so its working tree is not ` +
        `the commit it reports. Placement reads a tree that matches its own index.`
      );
    case 'source-declares-a-symlink':
      return (
        `The source declares ${refusal.path} as a symbolic link, which placement does not follow. ` +
        `Placement writes regular files inside the target only.`
      );
    case 'source-exports-no-predicate':
      return (
        `The source at ${refusal.commit} exports no distribution predicate this installer can ` +
        `read, and it will not guess which of its files travel.`
      );
    // Already redacted by the diagnosis that produced it: this renders, it does not sanitise.
    case 'fetch-failed':
      return refusal.detail;
    case 'target-carries-no-harness':
      return (
        `${refusal.target} does not carry the harness, so there is nothing to upgrade. ` +
        `To place it, run: keystone init --target ${refusal.target}`
      );
    // Already redacted by the relay that produced it: this renders, it does not sanitise.
    case 'upgrade-refused':
      return refusal.detail;
    case 'target-configures-hooks-path':
      return (
        `${refusal.target} already configures core.hooksPath as '${refusal.value}'. Placement ` +
        `will not replace it, because it is repository-wide and would disable whatever check is ` +
        `already there.`
      );
    case 'fetch-remote-redirected':
      return (
        `This machine's git configuration rewrites the harness source URL to ${refusal.effective}, ` +
        `which does not designate ${refusal.repository}. A url.<base>.insteadOf rewrite cannot be ` +
        `cleared for one command, so the fetch will not proceed against a repository it cannot ` +
        `verify. Remove the rewrite, or pass --source <path> to place from a clone you already have.`
      );
  }
}

/** The command to run instead, where this refusal has one. */
export function nextCommand(refusal: Refusal): string | null {
  return refusal.condition === 'target-carries-harness'
    ? `keystone upgrade --target ${refusal.target}`
    : null;
}
